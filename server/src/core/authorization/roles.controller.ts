import { Controller, Get } from '@nestjs/common';

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
   * Gated on users.view rather than a roles.view of its own: the only reason
   * to read this list is to populate a member form, so anyone who may see
   * members may see the role names.
   */
  @Get()
  @RequirePermissions('users.view')
  list() {
    return this.roles.listForOrganization();
  }
}
