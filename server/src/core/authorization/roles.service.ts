import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import { type Locale, SUPPORTED_LOCALES } from '../../common/locales';
import type { Transaction } from '../../database/database.module';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../database/errors';
import {
  invitationRoles,
  invitations,
  membershipRoles,
  memberships,
  permissions,
  rolePermissions,
  roles,
  users,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t, type Translatable, translate } from '../../i18n/translate';
import { recordContext, recordPrevious } from '../audit/audit-context';
import { ROLE_NAMES } from '../audit/audit-fields';
import type { RequestContext } from '../auth/request-context';
import type { CreateRoleDto, UpdateRoleDto } from './dto/role.dto';
import type { Role, RoleCatalogue, RoleDetail } from './dto/role-response.dto';
import {
  beyond,
  cannotGive,
  countOwners,
  giverHolds,
  type GrantingRole,
  grantingRoles,
  includesOwner,
  lockOwners,
} from './giving';
import { grantsOf, roleRef, rolesOfMembers, setRoles } from './member-roles';
import { isOwnerRole } from './owner';
import {
  ALL_PERMISSIONS,
  LOCKED_PERMISSIONS,
  NEVER_OFFERED,
  type Permission,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_NEEDS,
  PERMISSION_NOTES,
  quotedLine,
  ROLE_TEMPLATES,
  type RoleTemplateKey,
} from './permissions';
import { roleName, roleWords } from './role-words';

/** Who is reading: what their roles hold, and their language. */
export interface RoleReader {
  held: ReadonlySet<Permission>;
  locale: Locale;
}

/** A member moved by Move everyone, as their audit entry records it. */
export interface MovedMember {
  userId: string;
  from: string[];
  to: string[];
}

/** The catalogue's order, which every list of permissions keeps. */
const ORDER = new Map(ALL_PERMISSIONS.map((key, index) => [key, index]));

const byCatalogue = (keys: Iterable<Permission>) =>
  [...keys].sort((a, b) => ORDER.get(a)! - ORDER.get(b)!);

/**
 * Every name a built-in role goes by, in each of the app's languages,
 * lowercased: a made role may take none of them (ADR-080), so a message
 * choosing its words by Owner, Admin or Viewer never meets one.
 */
const BUILT_IN_NAMES = new Set(
  Object.entries(ROLE_NAMES).flatMap(([stored, message]) => [
    stored.toLocaleLowerCase(),
    ...SUPPORTED_LOCALES.map((locale) =>
      translate(message, locale).toLocaleLowerCase(),
    ),
  ]),
);

/**
 * The organization's roles (ADR-080): read by every member, made, changed
 * and deleted by Owners alone, whose permissions for it are never offered
 * in the editor, so editing a role cannot be used to climb. The built-in
 * three are the app's own and are never changed or deleted.
 *
 * Reads and writes role_permissions and membership_roles directly, as the
 * one place that may (eslint.config.mjs), through TenantDb's transaction
 * with the organization named in every query.
 */
@Injectable()
export class RolesService {
  constructor(private readonly db: TenantDb) {}

  /** Every role, the built-in three first, then those made, as made. */
  list(reader: RoleReader): Promise<Role[]> {
    return this.db.transaction(async (tx, organizationId) => {
      const rows = await tx
        .select(ROW)
        .from(roles)
        .where(eq(roles.organizationId, organizationId))
        // UUIDv7, so the order provisioning made them in: Owner, Admin,
        // Viewer, never alphabetical, which would read as a hierarchy.
        .orderBy(asc(roles.id));
      return this.summaries(tx, organizationId, rows, reader);
    });
  }

  /** A role's page: the role and who holds it. */
  detail(roleId: string, reader: RoleReader): Promise<RoleDetail> {
    return this.db.transaction(async (tx, organizationId) => {
      const row = await roleIn(tx, organizationId, roleId);
      const [summary] = await this.summaries(tx, organizationId, [row], reader);
      const rows = await tx
        .select({
          membershipId: memberships.id,
          id: users.id,
          name: users.name,
          email: users.email,
          photoFileId: users.photoFileId,
        })
        .from(membershipRoles)
        .innerJoin(
          memberships,
          eq(memberships.id, membershipRoles.membershipId),
        )
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(
            eq(membershipRoles.organizationId, organizationId),
            eq(membershipRoles.roleId, roleId),
          ),
        )
        .orderBy(asc(users.name), asc(users.id));
      const held = await rolesOfMembers(
        tx,
        rows.map((holder) => holder.membershipId),
      );
      const holders = rows.map(({ membershipId, ...holder }) => ({
        ...holder,
        roles: (held.get(membershipId) ?? []).map(roleRef),
      }));
      return { ...summary, holders, updatedAt: row.updatedAt };
    });
  }

  /**
   * What the editor offers (ADR-080): every permission in the catalogue's
   * order with its line, its note, its needs and whether it is offered or
   * locked, and the templates, all in the reader's language.
   */
  catalogue(locale: Locale): RoleCatalogue {
    const say = (message: Translatable) => translate(message, locale);
    return {
      permissions: ALL_PERMISSIONS.map((key) => {
        const note = PERMISSION_NOTES[key];
        return {
          key,
          line: say(PERMISSION_DESCRIPTIONS[key]),
          note: note ? say(note) : null,
          needs: [...(PERMISSION_NEEDS[key] ?? [])],
          offered: !NEVER_OFFERED.includes(key),
          locked: LOCKED_PERMISSIONS.includes(key),
        };
      }),
      templates: (
        Object.entries(ROLE_TEMPLATES) as [
          RoleTemplateKey,
          (typeof ROLE_TEMPLATES)[RoleTemplateKey],
        ][]
      ).map(([key, template]) => ({
        key,
        name: say(template.name),
        permissions: byCatalogue(template.permissions),
      })),
    };
  }

  /** A made role, its id for the read that answers the request. */
  async create(dto: CreateRoleDto, context: RequestContext): Promise<string> {
    const granted = grantsAsked(dto.permissions);
    try {
      return await this.db.transaction(async (tx, organizationId) => {
        await assertNameFree(tx, organizationId, dto.name, null);
        const [created] = await tx
          .insert(roles)
          .values({
            organizationId,
            name: dto.name,
            description: dto.description || null,
            isSystem: false,
            updatedBy: context.userId,
          })
          .returning({ id: roles.id });
        await setGrants(tx, created.id, granted);
        recordContext({ permissions: granted });
        return created.id;
      });
    } catch (error) {
      throw nameTakenOr(error, dto.name);
    }
  }

  /**
   * A made role saved from the editor: its name, line and grants made
   * exactly these, and the permissions added and removed recorded in
   * words. Refused when someone else saved it after the editor read it,
   * naming them, rather than overwriting what they did.
   */
  async update(
    roleId: string,
    dto: UpdateRoleDto,
    context: RequestContext,
  ): Promise<void> {
    const granted = grantsAsked(dto.permissions);
    try {
      await this.db.transaction(async (tx, organizationId) => {
        const role = await roleIn(tx, organizationId, roleId, { lock: true });
        if (role.isSystem) throw builtIn();
        // Read to the millisecond, as the editor was sent it.
        if (role.updatedAt.getTime() !== dto.updatedAt.getTime()) {
          throw await changedMeanwhile(tx, role);
        }
        await assertNameFree(tx, organizationId, dto.name, roleId);

        const before = new Set(
          (await grantsOf(tx, [roleId])).get(roleId) ?? [],
        );
        await tx
          .update(roles)
          .set({
            name: dto.name,
            description: dto.description || null,
            updatedBy: context.userId,
          })
          .where(
            and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)),
          );
        await setGrants(tx, roleId, granted);

        recordPrevious({ name: role.name, description: role.description });
        const added = granted.filter((key) => !before.has(key));
        const removed = byCatalogue(
          [...before].filter((key) => !granted.includes(key)),
        );
        // Only what moved: an empty list would write an entry for a save
        // that changed nothing.
        if (added.length > 0) recordContext({ permissionsAdded: added });
        if (removed.length > 0) recordContext({ permissionsRemoved: removed });
      });
    } catch (error) {
      throw nameTakenOr(error, dto.name);
    }
  }

  /**
   * A made role nobody holds and no live invitation names (ADR-080). An
   * invitation accepted, revoked or whose link has ended drops it from
   * its list, as the sweep would within 30 days; the audit log keeps
   * what it granted.
   */
  async remove(roleId: string): Promise<void> {
    try {
      await this.db.transaction(async (tx, organizationId) => {
        const role = await roleIn(tx, organizationId, roleId, { lock: true });
        if (role.isSystem) throw builtIn();

        const [{ holders }] = await tx
          .select({ holders: count() })
          .from(membershipRoles)
          .where(
            and(
              eq(membershipRoles.organizationId, organizationId),
              eq(membershipRoles.roleId, roleId),
            ),
          );
        if (holders > 0) throw held(role, holders);

        const named = tx
          .select({ id: invitationRoles.invitationId })
          .from(invitationRoles)
          .where(
            and(
              eq(invitationRoles.organizationId, organizationId),
              eq(invitationRoles.roleId, roleId),
            ),
          );
        const [{ live }] = await tx
          .select({ live: count() })
          .from(invitations)
          .where(
            and(
              eq(invitations.organizationId, organizationId),
              inArray(invitations.id, named),
              isNull(invitations.acceptedAt),
              isNull(invitations.revokedAt),
              gt(invitations.expiresAt, sql`now()`),
            ),
          );
        if (live > 0) {
          throw new ConflictException(
            t(
              {
                id: 'roles.invited',
                defaultMessage:
                  '{count, plural, one {An invitation waiting to be accepted names {role}} other {# invitations waiting to be accepted name {role}}}. Revoke {count, plural, one {it} other {them}}, or wait until {count, plural, one {it’s} other {they’re}} accepted, then delete the role.',
              },
              { count: live, role: role.name },
            ),
          );
        }

        recordContext({
          name: role.name,
          permissions: byCatalogue(
            (await grantsOf(tx, [roleId])).get(roleId) ?? [],
          ),
        });
        await tx.delete(invitationRoles).where(
          and(
            eq(invitationRoles.organizationId, organizationId),
            eq(invitationRoles.roleId, roleId),
            inArray(
              invitationRoles.invitationId,
              tx
                .select({ id: invitations.id })
                .from(invitations)
                .where(
                  and(
                    eq(invitations.organizationId, organizationId),
                    or(
                      isNotNull(invitations.acceptedAt),
                      isNotNull(invitations.revokedAt),
                      lte(invitations.expiresAt, sql`now()`),
                    ),
                  ),
                ),
            ),
          ),
        );
        await tx
          .delete(roles)
          .where(
            and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)),
          );
      });
    } catch (error) {
      // Given to someone, or named by an invitation, between the counts
      // and the delete: counted again, and refused as either.
      if (
        isForeignKeyViolation(error, 'membership_roles_role_fk') ||
        isForeignKeyViolation(error, 'invitation_roles_role_fk')
      ) {
        return this.remove(roleId);
      }
      throw error;
    }
  }

  /**
   * Move everyone (ADR-080): every member holding this role holds the
   * other in its place, under the rule that only what you hold can be
   * given, to members the caller may change, and never leaving the
   * organization without an Owner. Moved to Owner, a member holds Owner
   * alone. Who moved, from what to what, for one audit entry each.
   */
  move(
    roleId: string,
    toRoleId: string,
    context: RequestContext,
  ): Promise<MovedMember[]> {
    return this.db.transaction(async (tx, organizationId) => {
      await lockOwners(tx, organizationId);
      const from = await roleIn(tx, organizationId, roleId);
      if (toRoleId === roleId) {
        throw new BadRequestException(
          t(
            {
              id: 'roles.moveToSame',
              defaultMessage:
                'They already hold {role}. Choose another role to move them to.',
            },
            { role: roleName(from) },
          ),
        );
      }
      const [to] = (await grantingRoles(tx, organizationId, [toRoleId])) ?? [];
      if (!to) {
        throw new BadRequestException(
          t({ id: 'users.unknownRole', defaultMessage: 'Unknown role' }),
        );
      }

      const held = await giverHolds(tx, context.membershipId!);
      if (beyond(held, [to]).length > 0) {
        throw new ForbiddenException(
          isOwnerRole(to)
            ? t({
                id: 'users.ownerAssign',
                defaultMessage: 'Only an Owner can assign the Owner role',
              })
            : cannotGive([to]),
        );
      }

      const members = await holdersOf(tx, organizationId, roleId);
      const outside = members.filter(
        (member) => beyond(held, member.roles).length > 0,
      );
      if (outside.some((member) => includesOwner(member.roles))) {
        throw new ForbiddenException(
          t({
            id: 'users.ownerChange',
            defaultMessage: "Only an Owner can change an Owner's role",
          }),
        );
      }
      if (outside.length > 0) {
        throw new ForbiddenException(
          t(
            {
              id: 'roles.cannotMove',
              defaultMessage:
                '{count, plural, one {{names} holds roles} other {{names} hold roles}} that can do more than yours, so you can’t move them.',
            },
            {
              count: outside.length,
              names: outside.map((member) => member.name),
            },
          ),
        );
      }

      if (
        isOwnerRole(from) &&
        members.length > 0 &&
        (await countOwners(tx, organizationId)) <= members.length
      ) {
        throw new ConflictException(
          t({
            id: 'users.lastOwnerChange',
            defaultMessage: 'Transfer ownership before changing this role',
          }),
        );
      }

      const moved: MovedMember[] = [];
      for (const member of members) {
        const before = member.roles.map((role) => role.id);
        const after = isOwnerRole(to)
          ? [to.id]
          : [...before.filter((id) => id !== roleId && id !== to.id), to.id];
        await setRoles(tx, { id: member.membershipId, organizationId }, after);
        moved.push({ userId: member.userId, from: before, to: after });
      }
      return moved;
    });
  }

  /**
   * Roles as the list shows them: each one's line in the reader's
   * language, what it grants, how many hold it, and whether the reader
   * may give it.
   */
  private async summaries(
    tx: Transaction,
    organizationId: string,
    rows: RoleRow[],
    reader: RoleReader,
  ): Promise<Role[]> {
    const ids = rows.map((row) => row.id);
    const granted = await grantsOf(tx, ids);
    const counts = new Map(
      (
        await tx
          .select({ roleId: membershipRoles.roleId, holders: count() })
          .from(membershipRoles)
          .where(
            and(
              eq(membershipRoles.organizationId, organizationId),
              inArray(membershipRoles.roleId, ids),
            ),
          )
          .groupBy(membershipRoles.roleId)
      ).map((row) => [row.roleId, row.holders]),
    );

    return rows.map((row) => {
      const keys = byCatalogue(granted.get(row.id) ?? []);
      return {
        id: row.id,
        name: row.name,
        description: roleWords(row, reader.locale).description,
        builtIn: row.isSystem,
        permissions: keys,
        holderCount: counts.get(row.id) ?? 0,
        mayGive: keys.every((key) => reader.held.has(key)),
      };
    });
  }
}

const ROW = {
  id: roles.id,
  name: roles.name,
  description: roles.description,
  isSystem: roles.isSystem,
  updatedAt: roles.updatedAt,
  updatedBy: roles.updatedBy,
};

type RoleRow = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  updatedAt: Date;
  updatedBy: string | null;
};

/** A role of this organization's, or 404; held to the end when asked. */
async function roleIn(
  tx: Transaction,
  organizationId: string,
  roleId: string,
  options: { lock?: boolean } = {},
): Promise<RoleRow> {
  const query = tx
    .select(ROW)
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.organizationId, organizationId)));
  const [row] = await (options.lock ? query.for('update') : query);
  if (!row) {
    throw new NotFoundException(
      t({ id: 'roles.notFound', defaultMessage: 'No such role' }),
    );
  }
  return row;
}

/**
 * Who holds a role, each with every role they hold and what each grants:
 * Move everyone weighs them all.
 */
async function holdersOf(
  tx: Transaction,
  organizationId: string,
  roleId: string,
): Promise<
  {
    membershipId: string;
    userId: string;
    name: string;
    roles: GrantingRole[];
  }[]
> {
  const rows = await tx
    .select({
      membershipId: memberships.id,
      userId: memberships.userId,
      name: users.name,
    })
    .from(membershipRoles)
    .innerJoin(memberships, eq(memberships.id, membershipRoles.membershipId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(membershipRoles.organizationId, organizationId),
        eq(membershipRoles.roleId, roleId),
      ),
    )
    .orderBy(asc(users.name), asc(users.id));

  const held = await rolesOfMembers(
    tx,
    rows.map((row) => row.membershipId),
  );
  return Promise.all(
    rows.map(async (row) => ({
      ...row,
      roles:
        (await grantingRoles(
          tx,
          organizationId,
          (held.get(row.membershipId) ?? []).map((role) => role.id),
        )) ?? [],
    })),
  );
}

/**
 * The grants asked for, checked: the three every role holds added, none
 * of what stays the Owners', and each one's needs held with it, refused
 * as malformed (400) otherwise, before anything is read.
 */
function grantsAsked(asked: readonly Permission[]): Permission[] {
  const granted = new Set<Permission>([...asked, ...LOCKED_PERMISSIONS]);

  const owners = NEVER_OFFERED.filter((key) => granted.has(key));
  if (owners.length > 0) {
    throw new BadRequestException(
      t(
        {
          id: 'roles.notOffered',
          defaultMessage:
            'A role can’t include {permissions}: making, changing and deleting roles, and closing the organization, stay the Owners’.',
        },
        { permissions: owners.map(quotedLine) },
      ),
    );
  }

  for (const key of byCatalogue(granted)) {
    const missing = (PERMISSION_NEEDS[key] ?? []).filter(
      (need) => !granted.has(need),
    );
    if (missing.length > 0) {
      throw new BadRequestException(
        withCode(
          t(
            {
              id: 'roles.permissionRequires',
              defaultMessage: '{permission} needs {needs} too.',
            },
            { permission: quotedLine(key), needs: missing.map(quotedLine) },
          ),
          ERROR_CODES.permissionRequires,
        ),
      );
    }
  }
  return byCatalogue(granted);
}

/**
 * A made role's name: none reading as a built-in role in any of the
 * app's languages, and none another role has, ignoring case (ADR-080).
 */
async function assertNameFree(
  tx: Transaction,
  organizationId: string,
  name: string,
  roleId: string | null,
): Promise<void> {
  if (BUILT_IN_NAMES.has(name.toLocaleLowerCase())) {
    throw new ConflictException(
      withCode(
        t(
          {
            id: 'roles.nameBuiltIn',
            defaultMessage: '{name} is a built-in role. Choose another name.',
          },
          { name },
        ),
        ERROR_CODES.roleNameUnavailable,
      ),
    );
  }
  const [taken] = await tx
    .select({ id: roles.id })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        eq(sql`lower(${roles.name})`, name.toLowerCase()),
        ...(roleId ? [ne(roles.id, roleId)] : []),
      ),
    );
  if (taken) throw nameTaken(name);
}

function nameTaken(name: string): ConflictException {
  return new ConflictException(
    withCode(
      t(
        {
          id: 'roles.nameTaken',
          defaultMessage: 'There’s already a role called {name}.',
        },
        { name },
      ),
      ERROR_CODES.roleNameUnavailable,
    ),
  );
}

/** The same refusal for two saves racing to one name. */
function nameTakenOr(error: unknown, name: string): unknown {
  return isUniqueViolation(error, 'roles_org_lower_name_key')
    ? nameTaken(name)
    : error;
}

function builtIn(): ConflictException {
  return new ConflictException(
    t({
      id: 'roles.builtIn',
      defaultMessage:
        'Owner, Admin and Viewer are the app’s own, so they can’t be changed or deleted. Make a copy to vary one.',
    }),
  );
}

function held(role: RoleRow, holders: number): ConflictException {
  return new ConflictException(
    withCode(
      t(
        {
          id: 'roles.held',
          defaultMessage:
            '{count, plural, one {# member holds {role}} other {# members hold {role}}}. Move them to another role first.',
        },
        { count: holders, role: role.name },
      ),
      ERROR_CODES.roleHeld,
    ),
  );
}

/** Saved by someone else since the editor read it, naming them. */
async function changedMeanwhile(
  tx: Transaction,
  role: RoleRow,
): Promise<ConflictException> {
  const [saver] = role.updatedBy
    ? await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, role.updatedBy))
    : [];
  return new ConflictException(
    withCode(
      t(
        {
          id: 'roles.changed',
          defaultMessage:
            '{name} saved {role} while you were editing it. Your changes weren’t saved. Reload to see theirs, then make yours again.',
        },
        { name: saver?.name ?? '', role: role.name },
      ),
      ERROR_CODES.roleChanged,
    ),
  );
}

/** A role's grants made exactly these. */
async function setGrants(
  tx: Transaction,
  roleId: string,
  keys: readonly Permission[],
): Promise<void> {
  await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
  const rows = await tx
    .select({ id: permissions.id })
    .from(permissions)
    .where(inArray(permissions.key, [...keys]));
  await tx
    .insert(rolePermissions)
    .values(rows.map((row) => ({ roleId, permissionId: row.id })));
}
