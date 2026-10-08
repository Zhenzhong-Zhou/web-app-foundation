import { Module } from '@nestjs/common';

import { AuthorizationModule } from '../../core/authorization/authorization.module';
import { LookupController } from './lookup.controller';
import { LookupService } from './lookup.service';

/**
 * The lookup (ADR-056). AuthorizationModule for PermissionsService: which
 * kinds of record a member may see is decided per request, as the licence
 * override and adjustment guards decide theirs.
 */
@Module({
  imports: [AuthorizationModule],
  controllers: [LookupController],
  providers: [LookupService],
})
export class SearchModule {}
