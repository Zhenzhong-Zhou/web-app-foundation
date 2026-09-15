import { Module } from '@nestjs/common';

import { BomsController } from './boms.controller';
import { BomsService } from './boms.service';

/**
 * Exports BomsService because production orders need to read the active recipe
 * and copy its lines at release (ADR-029) — a question that belongs here
 * rather than being answered by a second module selecting from `bom_lines`
 * directly. Same argument PartnersModule makes for orders.
 *
 * No dependency on ProductsModule. Nothing here validates that a variant
 * exists before writing: the foreign key does that authoritatively, and a
 * SELECT first would be a round trip that is stale by the time the insert
 * runs.
 */
@Module({
  controllers: [BomsController],
  providers: [BomsService],
  exports: [BomsService],
})
export class BomsModule {}
