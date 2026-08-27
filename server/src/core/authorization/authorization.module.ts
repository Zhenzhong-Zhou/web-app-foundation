import { Module } from '@nestjs/common';

import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';

/**
 * The guard is registered globally in AppModule rather than exported here, but
 * it still needs a module to be instantiated in. Keeping it out of AuthModule
 * preserves the split: authentication answers "who is this", authorization
 * answers "may they".
 */
@Module({
  providers: [PermissionGuard, PermissionsService],
  exports: [PermissionGuard, PermissionsService],
})
export class AuthorizationModule {}
