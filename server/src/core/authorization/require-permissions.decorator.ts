import { SetMetadata } from '@nestjs/common';

import type { Permission } from './permissions';

export const REQUIRED_PERMISSIONS = 'authz:requiredPermissions';

/**
 * Gates a route on one or more permission keys. All listed permissions are
 * required, not any — the narrower reading, so a route that needs either has
 * to say so explicitly rather than getting it by accident.
 *
 * Typed against the Permission union rather than string: a typo in a
 * permission key is a route nobody can reach, and it would otherwise fail
 * silently at runtime instead of at compile time.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);
