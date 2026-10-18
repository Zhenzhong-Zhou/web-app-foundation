import { Module } from '@nestjs/common';

import { NumberingController } from './numbering.controller';
import { NumberingService } from './numbering.service';

/**
 * Each organization's document numbering (ADR-073): its settings and their
 * checks. Taking a number is a function, `takeNumber`, which every module
 * that numbers a document calls inside its own transaction.
 */
@Module({
  controllers: [NumberingController],
  providers: [NumberingService],
})
export class NumberingModule {}
