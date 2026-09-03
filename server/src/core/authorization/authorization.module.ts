import { Module } from '@nestjs/common';

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
  providers: [PermissionGuard, PermissionsService, RolesService],
  exports: [PermissionGuard, PermissionsService],
})
export class AuthorizationModule {}
