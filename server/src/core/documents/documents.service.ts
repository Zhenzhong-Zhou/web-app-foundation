import { buffer } from 'node:stream/consumers';

import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Response } from 'express';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';

import type { Locale } from '../../common/locales';
import { organizations, type PaperSize } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { Permission } from '../authorization/permissions';
import { dispositionOf } from '../files/content-disposition';
import { FilesService } from '../files/files.service';
import { registeredAddress } from '../organizations/registered-address';
import { type DocumentText, documentText } from './document-text';
import { PdfRenderer } from './pdf-renderer.service';

/** A document as its module reads it, ready to draw (ADR-071). */
export interface Printable {
  /** The customer's languages, which the document is worded in (ADR-054). */
  language: Locale;
  secondLanguage: Locale | null;
  /**
   * The seller's country as copied at issue, for the paper and the
   * formatting; null takes the organization's as it is now.
   */
  sellerCountry: string | null;
  /** The file's name. */
  name: string;
  /** The drawing, given the document's words and the logo it prints. */
  draw: (doc: DocumentText, logo: string | null) => TDocumentDefinitions;
}

/** What every document of an organization draws on, beside its own data. */
export interface Letterhead {
  /** The logo as a data URL, or null when it has none or prints none. */
  logo: string | null;
  /** The registered address's country, for the paper and the formatting. */
  country: string | null;
  /** The paper the organization chose; null takes it from the country. */
  paper: PaperSize | null;
}

/** Letter where it is the paper sold, A4 everywhere else (ADR-071). */
function paperFor(country: string | null): PaperSize {
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
   * The PDF as the response: inline for Print, which opens it in the
   * browser's own viewer, or an attachment for Download PDF, named either
   * way by the document. The document is read beside the letterhead, since
   * neither needs the other.
   */
  async send(
    res: Response,
    download: boolean,
    printable: Promise<Printable>,
  ): Promise<void> {
    const [document, letterhead] = await Promise.all([
      printable,
      this.letterhead(),
    ]);
    const pdf = await this.pdf(document, letterhead);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      dispositionOf(download ? 'attachment' : 'inline', document.name),
    );
    // A document is the organization's, for the person who asked.
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(pdf);
  }

  /**
   * The document as a PDF, on the letterhead: what Print and Download PDF
   * send, and what the export packs, one at a time.
   */
  pdf(document: Printable, letterhead: Letterhead): Promise<Buffer> {
    const country = document.sellerCountry ?? letterhead.country;
    return this.renderer.render(
      document.draw(
        documentText(document.language, document.secondLanguage, country),
        letterhead.logo,
      ),
      // The organization's choice for every document, or the country's.
      letterhead.paper ?? paperFor(country),
    );
  }

  /**
   * The organization's logo and country, as they are now: a document
   * already issued is not reprinted with the logo it had (ADR-060). Read
   * once by a caller drawing many.
   */
  async letterhead(): Promise<Letterhead> {
    const { logoFileId, country, paper } = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const [organization] = await tx
          .select({
            logoFileId: organizations.logoFileId,
            logoOnDocuments: organizations.logoOnDocuments,
            paperSize: organizations.paperSize,
          })
          .from(organizations)
          .where(eq(organizations.id, organizationId));
        const address = await registeredAddress(tx, organizationId);
        return {
          logoFileId: organization?.logoOnDocuments
            ? organization.logoFileId
            : null,
          country: address?.country ?? null,
          paper: organization?.paperSize ?? null,
        };
      },
    );

    if (!logoFileId) return { logo: null, country, paper };
    // A logo is shown to anyone in the organization: it asks no permission.
    const file = await this.files.find(
      logoFileId,
      'full',
      new Set<Permission>(),
    );
    const bytes = await buffer(await this.files.stream(file));
    return {
      logo: `data:${file.contentType};base64,${bytes.toString('base64')}`,
      country,
      paper,
    };
  }
}
