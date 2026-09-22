import { Module } from '@nestjs/common';

import { ProductLicencesController } from './product-licences.controller';
import { ProductLicencesService } from './product-licences.service';

@Module({
  controllers: [ProductLicencesController],
  providers: [ProductLicencesService],
  // Exported for the BOM service, which checks a licence is this tenant's
  // before attaching it — the foreign key alone cannot (ADR-003).
  exports: [ProductLicencesService],
})
export class ProductLicencesModule {}
