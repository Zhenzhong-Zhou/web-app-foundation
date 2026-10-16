import { Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { documentText } from '../../core/documents/document-text';
import {
  DocumentsService,
  paperFor,
} from '../../core/documents/documents.service';
import { invoiceDocument, invoiceFileName } from './invoice-document';
import { InvoicesService } from './invoices.service';

/** An invoice as a PDF (ADR-071), read as GET /invoices/:id reads it. */
@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly documents: DocumentsService,
  ) {}

  async send(id: string, res: Response, download: boolean): Promise<void> {
    const invoice = await this.invoices.findById(id);
    const letterhead = await this.documents.letterhead();
    // An issued invoice's seller country as stored at issue; a draft has
    // copied none yet, so the organization's as it is now.
    const country = invoice.sellerCountry ?? letterhead.country;

    await this.documents.send(
      res,
      invoiceDocument(
        invoice,
        documentText(invoice.language, invoice.secondLanguage, country),
        letterhead.logo,
      ),
      paperFor(country),
      invoiceFileName(invoice),
      download,
    );
  }
}
