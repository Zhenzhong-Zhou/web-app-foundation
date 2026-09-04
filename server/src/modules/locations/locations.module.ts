import { Module } from '@nestjs/common';

import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService],
  // Exported for the stock module, which will need to check leaf-ness before
  // writing a movement (ADR-024).
  exports: [LocationsService],
})
export class LocationsModule {}
