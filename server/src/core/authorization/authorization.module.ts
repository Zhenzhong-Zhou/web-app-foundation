import { Module } from '@nestjs/common';

import { MemberAccessService } from './member-access.service';
import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

/**
 * The guard is registered globally in AppModule rather than exported here, but
 * it still needs a module to be instantiated in. Keeping it out of AuthModule
 * preserves the split: authentication answers "who is this", authorization
 * answers "may they".
 */
@Module({
  controllers: [RolesController],
  // MemberAccessService for Home's welcome and Account (ADR-079).
  providers: [
    PermissionGuard,
    PermissionsService,
    RolesService,
    MemberAccessService,
  ],
  exports: [
    PermissionGuard,
    PermissionsService,
    RolesService,
    MemberAccessService,
  ],
})
export class AuthorizationModule {}
