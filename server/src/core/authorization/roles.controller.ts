import { Controller, Get } from '@nestjs/common';

import type { Role } from './dto/role-response.dto';
import { RequirePermissions } from './require-permissions.decorator';
import { RolesService } from './roles.service';

/**
 * Read-only in V1. Creating and editing roles means a permission picker, and
 * that raises a question with no answer yet: whether an Admin may build a
 * role holding permissions the Admin does not have. The three seeded roles
 * cover the acceptance path, and the escalation question gets an ADR when
 * editing arrives rather than being drifted into.
 */
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /**
   * Gated on roles.view, which every built-in role holds: the role names
   * Members shows beside each member and offers in its forms. It was gated
   * on users.view, which left roles.view gating nothing.
   */
  @Get()
  @RequirePermissions('roles.view')
  list(): Promise<Role[]> {
    return this.roles.listForOrganization();
  }
}
