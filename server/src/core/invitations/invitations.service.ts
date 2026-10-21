import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gt, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Env } from '../../config/env';
import type { Transaction } from '../../database/database.module';
import {
  authTokens,
  type InvitationLink,
  invitations,
  memberships,
  organizations,
  users,
} from '../../database/schema';
import { requestTimeZone } from '../../database/tenant-context';
import { TenantDb } from '../../database/tenant-db.service';
import { recipientLocale, t, type Translatable } from '../../i18n/translate';
import { MailService } from '../../shared/mail/mail.service';
import { recordContext } from '../audit/audit-context';
import { AuthTokenService } from '../auth/auth-token.service';
import type { RequestContext } from '../auth/request-context';
import {
  beyond,
  cannotGive,
  giverHolds,
  type GrantingRole,
  includesOwner,
  rolesToGive,
} from '../authorization/giving';
import {
  type HeldRole,
  nameRoles,
  roleRef,
  rolesOfInvitations,
} from '../authorization/member-roles';
import { roleName, roleWords, systemRoleOf } from '../authorization/role-words';
import { timeZoneOf } from '../organizations/time-zone';
import type { CreateInvitationDto } from './dto/create-invitation.dto';
import type {
  Invitation,
  InvitationLinkStatus,
} from './dto/invitation-response.dto';
import { appNameOf, invitationMail } from './invitation-mail';
import { inviterStillHere } from './inviter';
import { lastDayOf, linkEnd } from './link-end';

/** Links an organization may issue in 24 hours, resends included (ADR-077). */
const DAILY_LINKS = 50;

const DAY_MS = 24 * 60 * 60 * 1000;

/** An invitation's row, with who sent it, as the list reads it. */
interface InvitationRow {
  id: string;
  email: string;
  invitedById: string;
  invitedByName: string;
  createdAt: Date;
  link: InvitationLink;
  expiresAt: Date;
}

const ROW = {
  id: invitations.id,
  email: invitations.email,
  invitedById: invitations.invitedBy,
  invitedByName: users.name,
  createdAt: invitations.createdAt,
  link: invitations.link,
  expiresAt: invitations.expiresAt,
};

/** Neither accepted nor revoked: on Invited, whether or not its link ended. */
const pending = sql`${invitations.acceptedAt} is null and ${invitations.revokedAt} is null`;

/** Who may invite as Owner (ADR-016): an Owner. */
const OWNER_INVITE = t({
  id: 'invitations.ownerInvite',
  defaultMessage: 'Only an Owner can invite someone as Owner',
});

/**
 * Who may act on an invitation once made: whoever may give every role it
 * names (ADR-080); on an Owner's, an Owner, in ADR-077's words.
 */
const ON_AN_INVITATION = {
  owner: t({
    id: 'invitations.ownerInvitation',
    defaultMessage:
      'Only an Owner can resend, copy or revoke an invitation to join as Owner',
  }),
  beyond: (roles: readonly GrantingRole[]) =>
    t(
      {
        id: 'invitations.cannotActOn',
        defaultMessage:
          'Your roles don’t include everything {roles} can do, so you can’t resend, copy or revoke this invitation.',
      },
      { roles: roles.map(roleName) },
    ),
};

/**
 * Inviting, as the inviter does it on Members (ADR-077): invite, list,
 * resend, copy a link and revoke, all behind users.create and all through
 * TenantDb. Reading and accepting, which the invited person does signed
 * out, are InvitationAcceptanceService's.
 *
 * Every link is issued, and every invitation revoked, under one lock per
 * organization, so the checks before it (a member already, invited
 * already, the day's 50, still pending) see every link issued and every
 * revoke before it, and two Invite clicks cannot both pass. An invitation
 * acted on is read again inside that lock, and held, so one revoked or
 * accepted meanwhile is not issued a link (ADR-077).
 */
@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);
  private readonly clientUrl: string;
  private readonly appName: string | null;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly tokens: AuthTokenService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.clientUrl = config.get('CLIENT_URL', { infer: true });
    this.appName = appNameOf(config.get('MAIL_FROM', { infer: true }));
  }

  /**
   * Members' Invited: every pending invitation, newest first, never
   * counted as a member anywhere else (ADR-077). A revoked one has left
   * the list; an expired one stays, ended, for Resend.
   */
  async list(): Promise<Invitation[]> {
    const rows = await this.tenantDb.selectJoined(
      invitations,
      users,
      eq(users.id, invitations.invitedBy),
      ROW,
      pending,
      { orderBy: desc(invitations.id) },
    );
    return this.viewsOf(rows);
  }

  /**
   * Invite: the invitation and its first link, emailed, or handed back for
   * the inviter to pass on, with no email at all (ADR-077).
   */
  async invite(
    context: RequestContext,
    dto: CreateInvitationDto,
  ): Promise<{ invitation: Invitation; link: string | null }> {
    const copied = dto.delivery === 'link';

    const { id, roleIds, token, expiresAt, organizationId } =
      await this.tenantDb.transaction(async (tx, organizationId) => {
        await lock(tx, organizationId);
        const given = await grantable(
          tx,
          organizationId,
          context,
          dto.roleIds,
          { owner: OWNER_INVITE, beyond: cannotGive },
        );
        await this.mayIssue(tx, organizationId, context);

        const [member] = await tx
          .select({ id: memberships.id })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.organizationId, organizationId),
              eq(sql`lower(${users.email})`, dto.email),
            ),
          );
        if (member) {
          throw new ConflictException(
            withCode(
              t({
                id: 'invitations.alreadyAMember',
                defaultMessage:
                  'That address already belongs to a member of this organization. To give them other access, change their role instead.',
              }),
              ERROR_CODES.alreadyAMember,
            ),
          );
        }

        const [invited] = await tx
          .select({
            id: invitations.id,
            link: invitations.link,
            expiresAt: invitations.expiresAt,
          })
          .from(invitations)
          .where(
            and(
              eq(invitations.organizationId, organizationId),
              eq(sql`lower(${invitations.email})`, dto.email),
              pending,
            ),
          );
        if (invited) {
          throw new ConflictException(
            withCode(alreadyInvited(invited), ERROR_CODES.alreadyInvited, {
              invitationId: invited.id,
            }),
          );
        }

        await this.withinDailyLimit(tx, organizationId);

        const [inviter] = await tx
          .select({ locale: users.locale })
          .from(users)
          .where(eq(users.id, context.userId));

        const ends = await linkEnd(tx, organizationId);
        const [created] = await tx
          .insert(invitations)
          .values({
            organizationId,
            email: dto.email,
            // The inviter's own language unless they chose another.
            locale:
              dto.locale ?? recipientLocale(inviter?.locale, context.language),
            note: dto.note || null,
            invitedBy: context.userId,
            link: copied ? 'copied' : 'emailed',
            expiresAt: ends,
          })
          .returning({ id: invitations.id });
        await nameRoles(
          tx,
          { id: created.id, organizationId },
          given.map((role) => role.id),
        );

        const issued = await this.tokens.issueForInvitation(
          tx,
          created.id,
          ends,
        );
        return {
          id: created.id,
          roleIds: given.map((role) => role.id),
          organizationId,
          ...issued,
        };
      });

    recordContext({ email: dto.email, roleIds });
    if (copied) {
      return { invitation: await this.view(id), link: this.linkOf(token) };
    }
    if (!(await this.email(id, organizationId, token, expiresAt))) {
      recordContext({ emailSent: false });
    }
    return { invitation: await this.view(id), link: null };
  }

  /** Resend: a fresh link, emailed, its seven days restarted. */
  async resend(context: RequestContext, id: string): Promise<Invitation> {
    const { invitation, token, expiresAt, organizationId } = await this.reissue(
      context,
      id,
      'emailed',
    );

    recordContext({ email: invitation.email, roleIds: invitation.roleIds });
    if (!(await this.email(invitation.id, organizationId, token, expiresAt))) {
      recordContext({ emailSent: false });
    }
    return this.view(invitation.id);
  }

  /**
   * Copy link: a fresh link for the inviter to pass on, the emailed one
   * spent. Built here from CLIENT_URL, never from the request's host, and
   * handed back, since only the server knows the token (ADR-077).
   */
  async copyLink(
    context: RequestContext,
    id: string,
  ): Promise<{ invitation: Invitation; link: string }> {
    const { invitation, token } = await this.reissue(context, id, 'copied');

    recordContext({ email: invitation.email, roleIds: invitation.roleIds });
    return {
      invitation: await this.view(invitation.id),
      link: this.linkOf(token),
    };
  }

  /**
   * Revoke: the link ends and the invitation leaves Invited, its address
   * free to be invited again. The row is swept 30 days later (ADR-077).
   */
  async revoke(context: RequestContext, id: string): Promise<void> {
    const invitation = await this.tenantDb.transaction(
      async (tx, organizationId) => {
        await lock(tx, organizationId);
        const held = await pendingIn(tx, organizationId, id);
        await grantable(
          tx,
          organizationId,
          context,
          held.roleIds,
          ON_AN_INVITATION,
        );

        await tx
          .update(invitations)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(invitations.id, held.id),
              eq(invitations.organizationId, organizationId),
            ),
          );
        await this.tokens.spendInvitation(held.id, tx);
        return held;
      },
    );

    recordContext({ email: invitation.email, roleIds: invitation.roleIds });
  }

  /**
   * A fresh link for an invitation still pending, recorded as the way it
   * went: read, and its role checked, under the organization's lock.
   */
  private reissue(context: RequestContext, id: string, link: InvitationLink) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await lock(tx, organizationId);
      const invitation = await pendingIn(tx, organizationId, id);
      // Its roles deleted while its link had ended (ADR-080): nothing to
      // join as, so no new link.
      if (invitation.roleIds.length === 0) {
        throw new ConflictException(
          t({
            id: 'invitations.noRoles',
            defaultMessage:
              'The roles this invitation named have been deleted. Revoke it, and invite them again.',
          }),
        );
      }
      await grantable(
        tx,
        organizationId,
        context,
        invitation.roleIds,
        ON_AN_INVITATION,
      );
      await this.mayIssue(tx, organizationId, context);
      await this.withinDailyLimit(tx, organizationId);

      const ends = await linkEnd(tx, organizationId);
      const issued = await this.tokens.issueForInvitation(
        tx,
        invitation.id,
        ends,
      );
      await tx
        .update(invitations)
        .set({ link, expiresAt: ends })
        .where(
          and(
            eq(invitations.id, invitation.id),
            eq(invitations.organizationId, organizationId),
          ),
        );
      return { ...issued, invitation, organizationId };
    });
  }

  /**
   * What every link needs before it is issued, under the organization's
   * lock: an inviter whose own address is verified, since the invitation
   * is mail from our domain to an address someone typed; and an
   * organization not being deleted, which nobody would join but to watch
   * it close (ADR-077).
   */
  private async mayIssue(
    tx: Transaction,
    organizationId: string,
    context: RequestContext,
  ): Promise<void> {
    const [inviter] = await tx
      .select({ emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, context.userId));
    if (!inviter?.emailVerifiedAt) {
      throw new ForbiddenException(
        withCode(
          t({
            id: 'invitations.emailUnverified',
            defaultMessage:
              'Confirm your own email address before you invite anyone. Use the link we sent you, or send a new one.',
          }),
          ERROR_CODES.emailUnverified,
        ),
      );
    }

    const [organization] = await tx
      .select({ deletionScheduledAt: organizations.deletionScheduledAt })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    if (organization?.deletionScheduledAt) {
      throw new ConflictException(
        t({
          id: 'invitations.organizationDeleting',
          defaultMessage:
            'This organization is being deleted, so nobody can be invited to it.',
        }),
      );
    }
  }

  /**
   * At most DAILY_LINKS links in 24 hours, emailed or copied, resends
   * included (ADR-077), counted from the tokens themselves, which stay a
   * day for this. Refused with when the next one can be: the moment the
   * oldest of the last 50 turns 24 hours old, in details for the screen
   * to show in its reader's time, and in the organization's zone in the
   * message.
   */
  private async withinDailyLimit(
    tx: Transaction,
    organizationId: string,
  ): Promise<void> {
    const [oldest] = await tx
      .select({ createdAt: authTokens.createdAt })
      .from(authTokens)
      .innerJoin(invitations, eq(invitations.id, authTokens.invitationId))
      .where(
        and(
          eq(invitations.organizationId, organizationId),
          gt(authTokens.createdAt, sql`now() - interval '24 hours'`),
        ),
      )
      .orderBy(desc(authTokens.createdAt))
      .offset(DAILY_LINKS - 1)
      .limit(1);
    if (!oldest) return;

    const at = new Date(oldest.createdAt.getTime() + DAY_MS);
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: await timeZoneOf(tx, organizationId),
    }).format(at);
    throw new ConflictException(
      withCode(
        t(
          {
            id: 'invitations.dailyLimit',
            defaultMessage:
              'Your organization has made {limit} invitation links in the last 24 hours, the most it can. You can invite again from {time}.',
          },
          { limit: DAILY_LINKS, time },
        ),
        ERROR_CODES.invitationsDailyLimit,
        { at: at.toISOString() },
      ),
    );
  }

  /**
   * The invitation's email, in the language it carries, naming the inviter
   * while they are still a member here and only the organization once they
   * are not. A send that fails is said, not hidden (ADR-077): the
   * invitation stays, its link nobody received is spent, Invited says the
   * email did not go, with Resend and Copy link, and so does its audit
   * entry: whether it went is returned.
   */
  private async email(
    id: string,
    organizationId: string,
    token: string,
    expiresAt: Date,
  ): Promise<boolean> {
    const [facts, named] = await this.tenantDb.transaction(async (tx) => {
      const [row] = await tx
        .select({
          to: invitations.email,
          locale: invitations.locale,
          note: invitations.note,
          inviterName: users.name,
          inviterEmail: users.email,
          inviterMembershipId: memberships.id,
          organizationName: organizations.name,
        })
        .from(invitations)
        .innerJoin(users, eq(users.id, invitations.invitedBy))
        .leftJoin(memberships, inviterStillHere)
        .innerJoin(
          organizations,
          eq(organizations.id, invitations.organizationId),
        )
        .where(
          and(
            eq(invitations.id, id),
            eq(invitations.organizationId, organizationId),
          ),
        );
      const named = await rolesOfInvitations(tx, [id]);
      return [row, named.get(id) ?? []] as const;
    });

    try {
      await this.mail.send(
        invitationMail({
          locale: facts.locale,
          to: facts.to,
          inviter: facts.inviterMembershipId
            ? { name: facts.inviterName, email: facts.inviterEmail }
            : null,
          organizationName: facts.organizationName,
          roles: named.map((role) => ({
            ...roleWords(role, facts.locale),
            system: systemRoleOf(role),
          })),
          note: facts.note,
          // In the organization's zone (ADR-072), as every page says it.
          timeZone: requestTimeZone(),
          lastDay: lastDayOf(requestTimeZone(), expiresAt),
          link: this.linkOf(token),
          appName: this.appName,
        }),
      );
      return true;
    } catch (error) {
      this.logger.error(`Could not email invitation ${id}: ${String(error)}`);
      await this.tenantDb.transaction(async (tx) => {
        await tx
          .update(invitations)
          .set({ link: 'not_sent' })
          .where(
            and(
              eq(invitations.id, id),
              eq(invitations.organizationId, organizationId),
            ),
          );
        await this.tokens.spendInvitation(id, tx);
      });
      return false;
    }
  }

  /** The page an invitation opens, among the signed-out pages (ADR-077). */
  private linkOf(token: string): string {
    return `${this.clientUrl}/invitation?token=${token}`;
  }

  /** One invitation as Invited lists it. */
  private async view(id: string): Promise<Invitation> {
    const rows = await this.tenantDb.selectJoined(
      invitations,
      users,
      eq(users.id, invitations.invitedBy),
      ROW,
      eq(invitations.id, id),
    );
    const [view] = await this.viewsOf(rows);
    return view;
  }

  /** Invitations as Invited lists them, each with the role it grants. */
  private async viewsOf(rows: InvitationRow[]): Promise<Invitation[]> {
    const named = await this.tenantDb.transaction((tx) =>
      rolesOfInvitations(
        tx,
        rows.map((row) => row.id),
      ),
    );
    const timeZone = requestTimeZone();
    const now = new Date();
    return rows.map((row) =>
      viewOf(row, named.get(row.id) ?? [], timeZone, now),
    );
  }
}

/**
 * The organization's lock on its invitations, held to the end of the
 * transaction: links issued and invitations revoked one at a time.
 */
async function lock(tx: Transaction, organizationId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`invitations:${organizationId}`}, 0))`,
  );
}

/**
 * A pending invitation of this organization's, held for the rest of the
 * transaction so an acceptance cannot slip in beside it, or 404; with the
 * roles it names, none once they were deleted after its link ended.
 */
async function pendingIn(tx: Transaction, organizationId: string, id: string) {
  const [invitation] = await tx
    .select({ id: invitations.id, email: invitations.email })
    .from(invitations)
    .where(
      and(
        eq(invitations.id, id),
        eq(invitations.organizationId, organizationId),
        pending,
      ),
    )
    .for('update');
  if (!invitation) {
    throw new NotFoundException(
      t({ id: 'invitations.notFound', defaultMessage: 'No such invitation' }),
    );
  }
  const named = (await rolesOfInvitations(tx, [id])).get(id) ?? [];
  return { ...invitation, roleIds: named.map((role) => role.id) };
}

/**
 * The roles an invitation grants, if this organization has each and the
 * caller may give them all (ADR-080): one or more, Owner alone, and only
 * what the caller's roles hold together. An Admin acts on no Owner's
 * invitation, as on no Owner (ADR-016): neither invites one, issues its
 * link again, nor revokes it, and is told which (`refusals.owner`).
 */
async function grantable(
  tx: Transaction,
  organizationId: string,
  context: RequestContext,
  roleIds: readonly string[],
  refusals: {
    owner: Translatable;
    beyond: (roles: readonly GrantingRole[]) => Translatable;
  },
): Promise<GrantingRole[]> {
  const given = await rolesToGive(tx, organizationId, roleIds);
  const outside = beyond(await giverHolds(tx, context.membershipId!), given);
  if (includesOwner(outside)) throw new ForbiddenException(refusals.owner);
  if (outside.length > 0) {
    throw new ForbiddenException(refusals.beyond(outside));
  }
  return given;
}

/**
 * Already invited, said as its link stands: Resend is the way on, and an
 * ended link or an email that did not go is named as such, never with a
 * last day that has passed (ADR-077).
 */
function alreadyInvited(invited: {
  link: InvitationLink;
  expiresAt: Date;
}): Translatable {
  if (invited.link === 'not_sent') {
    return t({
      id: 'invitations.alreadyInvitedNotSent',
      defaultMessage:
        'That address has already been invited, but the email did not go. Resend the invitation, or copy its link.',
    });
  }
  if (invited.expiresAt <= new Date()) {
    return t({
      id: 'invitations.alreadyInvitedEnded',
      defaultMessage:
        'That address has already been invited, and its link has ended. Resend the invitation to start it again.',
    });
  }
  return t({
    id: 'invitations.alreadyInvited',
    defaultMessage:
      'That address has already been invited. Resend the invitation instead.',
  });
}

/**
 * Where a link stands, for Invited: an email that did not go first, since
 * no link of it is live; then ended, once its time is up; else the way it
 * went, with its last day.
 */
function viewOf(
  row: InvitationRow,
  named: HeldRole[],
  timeZone: string,
  now: Date,
): Invitation {
  const status: InvitationLinkStatus =
    row.link === 'not_sent'
      ? 'notSent'
      : row.expiresAt <= now
        ? 'ended'
        : row.link;
  return {
    id: row.id,
    email: row.email,
    roles: named.map(roleRef),
    invitedBy: { id: row.invitedById, name: row.invitedByName },
    invitedAt: row.createdAt,
    link: {
      status,
      lastDay: status === 'notSent' ? null : lastDayOf(timeZone, row.expiresAt),
    },
  };
}
