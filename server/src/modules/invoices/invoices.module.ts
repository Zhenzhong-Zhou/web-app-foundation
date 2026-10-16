import { Module } from '@nestjs/common';

import { DocumentsModule } from '../../core/documents/documents.module';
import { OrganizationsModule } from '../../core/organizations/organizations.module';
import { TaxCodesModule } from '../tax-codes/tax-codes.module';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';
import { InvoiceDocumentsExport } from './invoice-documents-export';
import { InvoiceDraftsService } from './invoice-drafts.service';
import { InvoiceIssuingService } from './invoice-issuing.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  // Organizations for the export's registry, which this module adds the
  // invoices' and credit notes' PDFs to (ADR-071).
  imports: [TaxCodesModule, DocumentsModule, OrganizationsModule],
  controllers: [InvoicesController, CreditNotesController],
  exports: [InvoicesService],
  providers: [
    InvoicesService,
    InvoiceDraftsService,
    InvoiceIssuingService,
    CreditNotesService,
    InvoiceDocumentsExport,
  ],
})
export class InvoicesModule {}
