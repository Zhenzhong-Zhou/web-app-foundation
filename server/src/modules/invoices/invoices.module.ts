import { Module } from '@nestjs/common';

import { TaxCodesModule } from '../tax-codes/tax-codes.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [TaxCodesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
