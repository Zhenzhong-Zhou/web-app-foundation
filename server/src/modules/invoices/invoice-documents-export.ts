import { Injectable, type OnModuleInit } from '@nestjs/common';
import { and, eq, isNotNull } from 'drizzle-orm';

import {
  DocumentsService,
  type Letterhead,
  type Printable,
} from '../../core/documents/documents.service';
import { fileNameOf } from '../../core/files/content-disposition';
import {
  ExportContributions,
  type ExportContributor,
  type ExportEntry,
} from '../../core/organizations/export-contributions';
import type { Transaction } from '../../database/database.module';
import { creditNotes, invoices } from '../../database/schema';
import { printableCreditNote } from './credit-note-document';
import { printableInvoice } from './invoice-document';
import { InvoicesService } from './invoices.service';

/**
 * Every invoice ever issued, voided ones included, and every credit note,
 * as PDFs in the organization's export (#118, ADR-071), exactly as
 * Download PDF gives them, named by their numbers. A draft is left out:
 * it was never sent, and has no number.
 */
@Injectable()
export class InvoiceDocumentsExport implements ExportContributor, OnModuleInit {
  constructor(
    private readonly contributions: ExportContributions,
    private readonly invoices: InvoicesService,
    private readonly documents: DocumentsService,
  ) {}

  onModuleInit(): void {
    this.contributions.register(this);
  }

  async entries(
    tx: Transaction,
    organizationId: string,
  ): Promise<ExportEntry[]> {
    const issued = await tx
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(
        and(
          eq(invoices.organizationId, organizationId),
          isNotNull(invoices.number),
        ),
      )
      .orderBy(invoices.number);
    const notes = await tx
      .select({ id: creditNotes.id, number: creditNotes.number })
      .from(creditNotes)
      .where(eq(creditNotes.organizationId, organizationId))
      .orderBy(creditNotes.number);

    // The logo read once, by the first PDF drawn, not once a document;
    // beside the document, as Download PDF reads the two.
    let letterhead: Promise<Letterhead> | undefined;
    const drawn = (printable: () => Promise<Printable>) => async () => {
      letterhead ??= this.documents.letterhead();
      const [document, head] = await Promise.all([printable(), letterhead]);
      return this.documents.pdf(document, head);
    };

    return [
      ...issued.map(({ id, number }) => ({
        // Never null here, as only issued invoices are read; the id stands
        // in only to satisfy the column's type.
        name: `documents/invoices/${fileNameOf(number ?? id)}.pdf`,
        bytes: drawn(() => this.invoices.findById(id).then(printableInvoice)),
      })),
      ...notes.map(({ id, number }) => ({
        name: `documents/credit-notes/${fileNameOf(number)}.pdf`,
        bytes: drawn(() =>
          this.invoices.findCreditNote(id).then(printableCreditNote),
        ),
      })),
    ];
  }
}
