import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { RecentController } from './recent.controller';
import { RecentService } from './recent.service';

/** Recently opened (ADR-058). */
@Module({
  imports: [AuthorizationModule],
  controllers: [RecentController],
  providers: [RecentService],
  // For the welcome on Home, whose lookups are ticked by what was opened
  // (ADR-079).
  exports: [RecentService],
})
export class RecentModule {}
