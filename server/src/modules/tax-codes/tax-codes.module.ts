import { Module } from '@nestjs/common';

import { TaxCodesController } from './tax-codes.controller';
import { TaxCodesService } from './tax-codes.service';

@Module({
  controllers: [TaxCodesController],
  providers: [TaxCodesService],
  // Exported for invoicing, which checks a code is this tenant's before a
  // line carries it — the foreign key alone cannot (ADR-003).
  exports: [TaxCodesService],
})
export class TaxCodesModule {}
