import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { memberships } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { WorkDetailsDto } from './dto/work-details.dto';

export interface WorkDetails {
  jobTitle: string | null;
  department: string | null;
  location: string | null;
  workPhone: string | null;
  extension: string | null;
}

const FIELDS = [
  'jobTitle',
  'department',
  'location',
  'workPhone',
  'extension',
] as const;

/** Your details at work, on your membership here (ADR-063). */
@Injectable()
export class WorkService {
  constructor(private readonly tenantDb: TenantDb) {}

  details(userId: string): Promise<WorkDetails> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = await tx
        .select({
          jobTitle: memberships.jobTitle,
          department: memberships.department,
          location: memberships.location,
          workPhone: memberships.workPhone,
          extension: memberships.extension,
        })
        .from(memberships)
        .where(mine(userId, organizationId));
      return row;
    });
  }

  /** Only the fields sent; null clears one. */
  async updateDetails(userId: string, input: WorkDetailsDto): Promise<void> {
    const changes: Partial<WorkDetails> = {};
    for (const field of FIELDS) {
      if (input[field] !== undefined) changes[field] = input[field] ?? null;
    }
    if (Object.keys(changes).length === 0) return;

    await this.tenantDb.transaction((tx, organizationId) =>
      tx.update(memberships).set(changes).where(mine(userId, organizationId)),
    );
  }
}

function mine(userId: string, organizationId: string) {
  return and(
    eq(memberships.userId, userId),
    eq(memberships.organizationId, organizationId),
  );
}
