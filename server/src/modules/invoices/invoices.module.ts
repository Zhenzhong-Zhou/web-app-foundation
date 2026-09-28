import { Module } from '@nestjs/common';

import { TaxCodesModule } from '../tax-codes/tax-codes.module';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotesService } from './credit-notes.service';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [TaxCodesModule],
  controllers: [InvoicesController, CreditNotesController],
  providers: [InvoicesService, CreditNotesService],
})
export class InvoicesModule {}
