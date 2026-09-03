import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';

import { roles } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';

@Injectable()
export class RolesService {
  constructor(private readonly db: TenantDb) {}

  /**
   * Roles are created per organization by provisionOrganization (ADR-003), so
   * TenantDb supplies the filter and there is no organization id here.
   *
   * Ordered by id: UUIDv7 sorts by creation time (ADR-010), which is the order
   * provisioning created them — Owner, Admin, Viewer. Alphabetical would put
   * Admin above Owner and read as a hierarchy that is not one.
   */
  async listForOrganization() {
    const rows = await this.db.select(roles, undefined, {
      orderBy: asc(roles.id),
    });

    // Projected here rather than in the query: TenantDb returns whole rows by
    // design, and the tenant filter it guarantees is worth more than the two
    // columns saved.
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async findById(roleId: string) {
    const [row] = await this.db.select(roles, eq(roles.id, roleId));
    return row ?? null;
  }
}
