import { Module } from '@nestjs/common';

import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

/**
 * Exports the service because orders will need to check a partner exists and is
 * active before writing an order against it — a question that belongs here
 * rather than being answered by a second module reading the table directly.
 */
@Module({
  controllers: [PartnersController],
  providers: [PartnersService],
  exports: [PartnersService],
})
export class PartnersModule {}
