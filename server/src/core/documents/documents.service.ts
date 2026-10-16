import type { Readable } from 'node:stream';

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import { organizations } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { Permission } from '../authorization/permissions';
import { FilesService } from '../files/files.service';
import { registeredAddress } from '../organizations/registered-address';
import { type PaperSize, PdfRenderer } from './pdf-renderer.service';

/** What every document of an organization draws on, beside its own data. */
export interface Letterhead {
  /** The logo as a data URL, or null when it has none or prints none. */
  logo: string | null;
  /** The registered address's country, for the paper and the formatting. */
  country: string | null;
}

/** Letter where it is the paper sold, A4 everywhere else (ADR-071). */
export function paperFor(country: string | null): PaperSize {
  return country === 'CA' || country === 'US' ? 'letter' : 'a4';
}

/**
 * A document's PDF, end to end (ADR-071): what the organization prints on
 * every one, the drawing, and the response that carries it.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly files: FilesService,
    private readonly renderer: PdfRenderer,
  ) {}

  /**
   * The organization's logo and country, as they are now: a document
   * already issued is not reprinted with the logo it had (ADR-060).
   */
  async letterhead(): Promise<Letterhead> {
    const { logoFileId, country } = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const [organization] = await tx
          .select({
            logoFileId: organizations.logoFileId,
            logoOnDocuments: organizations.logoOnDocuments,
          })
          .from(organizations)
          .where(eq(organizations.id, organizationId));
        const address = await registeredAddress(tx, organizationId);
        return {
          logoFileId: organization?.logoOnDocuments
            ? organization.logoFileId
            : null,
          country: address?.country ?? null,
        };
      },
    );

    if (!logoFileId) return { logo: null, country };
    // A logo is shown to anyone in the organization: it asks no permission.
    const file = await this.files.find(
      logoFileId,
      'full',
      new Set<Permission>(),
    );
    const bytes = await bytesOf(await this.files.stream(file));
    return {
      logo: `data:${file.contentType};base64,${bytes.toString('base64')}`,
      country,
    };
  }

  /**
   * The PDF as the response: inline for Print, which opens it in the
   * browser's own viewer, or an attachment for Download PDF, named either
   * way by the document.
   */
  async send(
    res: Response,
    definition: TDocumentDefinitions,
    paper: PaperSize,
    name: string,
    download: boolean,
  ): Promise<void> {
    const pdf = await this.renderer.render(definition, paper);
    const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    // A document is the organization's, for the person who asked.
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(pdf);
  }
}

async function bytesOf(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
