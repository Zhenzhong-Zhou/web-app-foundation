import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { RecentModule } from '../recent/recent.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';
import { WelcomeService } from './welcome.service';

/**
 * Home (ADR-058; ADR-091). It counts each tile by its list's own
 * conditions, shared with those lists' modules, so a tile's count is its
 * list's rows; AuthorizationModule decides which tiles a member sees, and
 * says what they may do for the welcome (ADR-079), whose lookups
 * RecentModule ticks.
 */
@Module({
  imports: [AuthorizationModule, RecentModule],
  controllers: [HomeController],
  providers: [HomeService, WelcomeService],
})
export class HomeModule {}
