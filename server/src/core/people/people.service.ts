import type { Readable } from 'node:stream';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { files, memberships, roles, users } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { type AuditRecord, AuditService } from '../audit/audit.service';
import type { Permission } from '../authorization/permissions';
import { FILE_STORAGE, type FileStorage, keyOf } from '../files/file-storage';

/**
 * How recently someone was here, as everyone sees it (ADR-063): coarse, so
 * it says whether a colleague is around without keeping their hours. Those
 * who may read the history get the time as well.
 */
export type ActiveSince = 'today' | 'week' | 'month' | 'older' | 'never';

export interface Person {
  id: string;
  name: string;
  email: string;
  photoFileId: string | null;
  roleId: string;
  roleName: string;
  jobTitle: string | null;
  department: string | null;
  location: string | null;
  workPhone: string | null;
  extension: string | null;
  memberSince: Date;
  active: ActiveSince;
  /** Only for those with audit.view; absent for everyone else. */
  lastActiveAt?: Date | null;
}

export interface PersonDetail extends Person {
  /** The last 20 things they did here, for those with audit.view only. */
  recentActivity?: AuditRecord[];
}

const DAY = 24 * 60 * 60 * 1000;

export function activeSince(lastActiveAt: Date | null, now: Date): ActiveSince {
  if (!lastActiveAt) return 'never';
  const elapsed = now.getTime() - lastActiveAt.getTime();
  if (elapsed < DAY) return 'today';
  if (elapsed < 7 * DAY) return 'week';
  if (elapsed < 30 * DAY) return 'month';
  return 'older';
}

/**
 * The organization's people (ADR-063): who they are, how to reach them,
 * roughly when they were here, and for those who may read the history,
 * exactly when and what they did. Read-only: Members manages them.
 */
@Injectable()
export class PeopleService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Everyone in the organization, by name. */
  list(held: ReadonlySet<Permission>): Promise<Person[]> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const rows = await tx
        .select(PERSON_COLUMNS)
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(
          and(
            eq(memberships.organizationId, organizationId),
            isNull(users.deletedAt),
          ),
        )
        .orderBy(asc(users.name));
      return rows.map((row) => shown(row, held));
    });
  }

  /** One person, with their recent work for those who may read it. */
  async find(
    userId: string,
    held: ReadonlySet<Permission>,
  ): Promise<PersonDetail> {
    const row = await this.tenantDb.transaction(async (tx, organizationId) => {
      const [found] = await tx
        .select(PERSON_COLUMNS)
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(
          and(
            eq(memberships.organizationId, organizationId),
            eq(memberships.userId, userId),
            isNull(users.deletedAt),
          ),
        );
      return found;
    });
    if (!row) throw notFound();

    const person: PersonDetail = shown(row, held);
    if (held.has('audit.view')) {
      const { entries } = await this.audit.list({ actorId: userId, limit: 20 });
      person.recentActivity = entries;
    }
    return person;
  }

  /**
   * A colleague's photo, in one size: only for someone who shares the
   * caller's organization, else a 404 like any record (ADR-063).
   */
  async photo(
    userId: string,
    size: 'thumb' | 'full',
  ): Promise<{ key: string; bytes: number; etag: string }> {
    const found = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        const [row] = await tx
          .select({ sizes: files.sizes, sha256: files.sha256, id: files.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .innerJoin(files, eq(files.id, users.photoFileId))
          .where(
            and(
              eq(memberships.organizationId, organizationId),
              eq(memberships.userId, userId),
              eq(files.userId, userId),
            ),
          );
        return row;
      },
    );
    const stored = found?.sizes[size];
    if (!found || !stored) throw notFound();

    return {
      key: keyOf(userId, found.id, size),
      bytes: stored.bytes,
      etag: `"${found.sha256.slice(0, 32)}-${size}"`,
    };
  }

  stream(key: string): Promise<Readable> {
    return this.storage.get(key);
  }
}

const PERSON_COLUMNS = {
  id: users.id,
  name: users.name,
  email: users.email,
  photoFileId: users.photoFileId,
  roleId: memberships.roleId,
  roleName: roles.name,
  jobTitle: memberships.jobTitle,
  department: memberships.department,
  location: memberships.location,
  workPhone: memberships.workPhone,
  extension: memberships.extension,
  memberSince: memberships.createdAt,
  lastActiveAt: memberships.lastActiveAt,
};

type PersonRow = Omit<Person, 'active'> & { lastActiveAt: Date | null };

/** As the caller may see it: the exact time only with audit.view. */
function shown(row: PersonRow, held: ReadonlySet<Permission>): Person {
  const { lastActiveAt, ...person } = row;
  return {
    ...person,
    active: activeSince(lastActiveAt, new Date()),
    ...(held.has('audit.view') ? { lastActiveAt } : {}),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException(
    t({ id: 'people.notFound', defaultMessage: 'No such person here' }),
  );
}
