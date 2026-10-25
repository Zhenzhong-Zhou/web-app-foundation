import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Locale } from '../../common/locales';
import type { Database, Transaction } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { isUniqueViolation } from '../../database/errors';
import {
  files,
  invitations,
  memberships,
  organizations,
  users,
} from '../../database/schema';
import { runInTenantContext } from '../../database/tenant-context';
import { t } from '../../i18n/translate';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import {
  AccountEventService,
  type EventMeta,
} from '../auth/account-event.service';
import { type AuthenticatedUser, AuthService } from '../auth/auth.service';
import { AuthTokenService } from '../auth/auth-token.service';
import { PasswordService } from '../auth/password.service';
import type { RequestContext } from '../auth/request-context';
import { type NewSession, SessionService } from '../auth/session.service';
import { giveRoles, rolesOfInvitation } from '../authorization/member-roles';
import {
  roleName,
  roleWords,
  systemOf,
  systemRoleOf,
} from '../authorization/role-words';
import {
  FILE_STORAGE,
  type FileStorage,
  keyOf,
  ownerOf,
} from '../files/file-storage';
import { renderLogoMark } from '../files/images';
import { NOTIFICATION_TYPES } from '../notifications/notification-types';
import { NotificationsService } from '../notifications/notifications.service';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import type { InvitationPreview } from './dto/invitation-response.dto';
import { inviterStillHere } from './inviter';
import { lastDayOf } from './link-end';

/**
 * The one refusal every link that is not live gets, all alike (ADR-077),
 * with its code, so the page tells it from a field the server refused.
 */
export function ended(): BadRequestException {
  return new BadRequestException(
    withCode(
      t({
        id: 'invitations.ended',
        defaultMessage:
          'This invitation has ended. Ask whoever invited you for a new one.',
      }),
      ERROR_CODES.invitationEnded,
    ),
  );
}

/** An invitation whose link is live, as accepting needs it. */
interface Live {
  id: string;
  organizationId: string;
  email: string;
  /** The roles it grants, which joining gives (ADR-080). */
  roleIds: string[];
  locale: Locale;
  link: string;
  organizationDeleting: boolean;
}

/**
 * The invited person's half of an invitation (ADR-077): reading it, and
 * accepting it, both signed out or signed in as anyone, by the link alone.
 *
 * Uses the unscoped handle: a link is read before any organization is
 * known, as verification's is, and accepting writes the account and the
 * membership that make one known. The only lint exception in
 * core/invitations besides the sweep.
 */
@Injectable()
export class InvitationAcceptanceService {
  private readonly logger = new Logger(InvitationAcceptanceService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
    private readonly tokens: AuthTokenService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly events: AccountEventService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * What the invitation page shows, and nothing more: the address, the
   * organization's name and logo, and its deletion day while it is being
   * deleted; who invited them, while still a member here; the role in
   * words in the page's language, the note, the link's last day, whether
   * the address has an account, and the language to start in. Null for a
   * link used, expired or revoked, all alike, and for one that never
   * existed. Spends nothing, so a mail scanner's fetch burns nothing.
   */
  async read(token: string, locale: Locale): Promise<InvitationPreview | null> {
    const invitationId = await this.tokens.findInvitation(token);
    if (!invitationId) return null;

    const [row] = await this.db
      .select({
        email: invitations.email,
        locale: invitations.locale,
        note: invitations.note,
        expiresAt: invitations.expiresAt,
        acceptedAt: invitations.acceptedAt,
        revokedAt: invitations.revokedAt,
        organizationId: organizations.id,
        organizationName: organizations.name,
        logoFileId: organizations.logoFileId,
        deletionScheduledAt: organizations.deletionScheduledAt,
        timeZone: organizations.timeZone,
        inviterName: users.name,
        inviterEmail: users.email,
        inviterMembershipId: memberships.id,
      })
      .from(invitations)
      .innerJoin(
        organizations,
        eq(organizations.id, invitations.organizationId),
      )
      .innerJoin(users, eq(users.id, invitations.invitedBy))
      .leftJoin(memberships, inviterStillHere)
      .where(eq(invitations.id, invitationId));
    if (!row || row.acceptedAt || row.revokedAt) return null;

    const named = await rolesOfInvitation(this.db, invitationId);

    const [account] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, row.email));

    return {
      email: row.email,
      organization: {
        name: row.organizationName,
        logo: row.logoFileId
          ? await this.logoOf(row.organizationId, row.logoFileId)
          : null,
        deletionScheduledAt: row.deletionScheduledAt,
      },
      inviter: row.inviterMembershipId
        ? { name: row.inviterName, email: row.inviterEmail }
        : null,
      roles: named.map((role) => ({
        ...roleWords(role, locale),
        system: systemRoleOf(role),
      })),
      note: row.note,
      lastDay: lastDayOf(row.timeZone, row.expiresAt),
      hasAccount: account !== undefined,
      locale: row.locale,
    };
  }

  /**
   * Accepting, signed in as the invitation's address: the person signed
   * in on the invitation page through POST /auth/login, so its rate limit,
   * timing, new sign-in email and Keep me signed in are sign-in's. Their
   * account joins the organization, and the session moves to it.
   *
   * Refused when the session is another address's, when the account
   * already belongs to an organization (one person in two is deferred),
   * and while its deletion is scheduled: Keep my account first, then Join,
   * the link staying live meanwhile.
   */
  async acceptSignedIn(
    context: RequestContext,
    token: string,
    meta: EventMeta,
  ): Promise<AuthenticatedUser> {
    const invitation = await this.live(token);

    if (context.email.toLowerCase() !== invitation.email) {
      throw otherAccount(invitation.email);
    }

    const [account] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        locale: users.locale,
        emailVerifiedAt: users.emailVerifiedAt,
        deletionScheduledAt: users.deletionScheduledAt,
      })
      .from(users)
      .where(eq(users.id, context.userId));
    const held = await this.db
      .select({ organizationId: memberships.organizationId })
      .from(memberships)
      .where(eq(memberships.userId, context.userId));

    this.refuseHeld(held, invitation);
    if (account?.deletionScheduledAt) {
      throw deletionScheduled(account.deletionScheduledAt);
    }
    this.refuseDeleting(invitation);

    const verifies = invitation.link === 'emailed' && !account?.emailVerifiedAt;

    await this.db.transaction(async (tx) => {
      // The account held to the end, and both asked again: a deletion
      // scheduled, or another invitation accepted, since.
      const [locked] = await tx
        .select({ deletionScheduledAt: users.deletionScheduledAt })
        .from(users)
        .where(eq(users.id, context.userId))
        .for('update');
      if (locked?.deletionScheduledAt) {
        throw deletionScheduled(locked.deletionScheduledAt);
      }
      this.refuseHeld(
        await tx
          .select({ organizationId: memberships.organizationId })
          .from(memberships)
          .where(eq(memberships.userId, context.userId)),
        invitation,
      );

      await this.join(tx, invitation, token, context.userId);
      if (verifies) {
        // The transaction's time, the membership's start: confirmed by
        // joining reads as joined confirmed on the welcome (ADR-079).
        await tx
          .update(users)
          .set({ emailVerifiedAt: sql`now()` })
          .where(eq(users.id, context.userId));
      }
    });

    await this.sessions.setCurrentOrg(
      context.sessionId,
      invitation.organizationId,
    );
    await this.recorded(context.userId, invitation, meta, verifies);
    await this.tellInviter(
      context.userId,
      account?.name ?? context.name,
      invitation,
    );

    return {
      id: context.userId,
      email: account?.email ?? context.email,
      name: account?.name ?? context.name,
      emailVerified: verifies || Boolean(account?.emailVerifiedAt),
      locale: account?.locale ?? null,
      organizationId: invitation.organizationId,
    };
  }

  /**
   * Accepting with no account: the person names themselves and chooses
   * the password, and the account, the membership and the acceptance are
   * written in one transaction, so no account exists without a membership
   * (ADR-004). Signed in after, as registration does, following Keep me
   * signed in (ADR-065). The account takes the page's language.
   *
   * An emailed link verifies the address, since only its inbox could have
   * read it; a copied one does not, and the usual verification email
   * follows, as at registration.
   */
  async acceptNew(
    dto: AcceptInvitationDto,
    meta: EventMeta,
  ): Promise<{ user: AuthenticatedUser; session: NewSession }> {
    const { name, password } = dto;
    if (!name || !password) throw nameAndPassword();

    const invitation = await this.live(dto.token);

    const [account] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, invitation.email));
    if (account) throw signInFirst();
    this.refuseDeleting(invitation);

    // Hashed before the transaction opens, as at registration.
    const passwordHash = await this.passwords.hash(password);
    const verified = invitation.link === 'emailed';
    // The language the page was in, chosen there or the invitation's that
    // it starts in: they read the page and accepted in it, and following
    // the browser could switch them to one they never saw (ADR-077).
    const locale = dto.locale ?? invitation.locale;

    let user: AuthenticatedUser;
    try {
      user = await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(users)
          .values({
            email: invitation.email,
            name,
            passwordHash,
            locale,
            // The membership's start, as above.
            emailVerifiedAt: verified ? sql`now()` : null,
          })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            locale: users.locale,
          });

        await this.join(tx, invitation, dto.token, created.id);

        return {
          ...created,
          emailVerified: verified,
          organizationId: invitation.organizationId,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower_key')) {
        throw signInFirst();
      }
      throw error;
    }

    const session = await this.sessions.create(
      user.id,
      invitation.organizationId,
      meta,
      { keepSignedIn: dto.keepSignedIn ?? true },
    );
    await this.recorded(user.id, invitation, meta, verified);
    await this.tellInviter(user.id, user.name, invitation);
    if (!verified) {
      await this.auth.sendVerificationEmail(
        user.id,
        user.email,
        user.name,
        locale,
      );
    }

    return { user, session };
  }

  /**
   * The invitation a live link is for, or ENDED: used, expired and
   * revoked alike, and one naming no role, whose roles were deleted while
   * its link had ended, since there is nothing to join as.
   */
  private async live(token: string): Promise<Live> {
    const invitationId = await this.tokens.findInvitation(token);
    const [row] = invitationId
      ? await this.db
          .select({
            id: invitations.id,
            organizationId: invitations.organizationId,
            email: invitations.email,
            locale: invitations.locale,
            link: invitations.link,
            acceptedAt: invitations.acceptedAt,
            revokedAt: invitations.revokedAt,
            deletionScheduledAt: organizations.deletionScheduledAt,
          })
          .from(invitations)
          .innerJoin(
            organizations,
            eq(organizations.id, invitations.organizationId),
          )
          .where(eq(invitations.id, invitationId))
      : [];
    if (!row || row.acceptedAt || row.revokedAt) throw ended();

    const named = await rolesOfInvitation(this.db, row.id);
    // Resend refuses it with invitations.noRoles, in the inviter's words;
    // whoever accepts gets the one refusal every link that cannot be used
    // gets (ADR-077).
    if (named.length === 0) throw ended();
    return {
      ...row,
      roleIds: named.map((role) => role.id),
      organizationDeleting: row.deletionScheduledAt !== null,
    };
  }

  /**
   * The membership and the acceptance, with the link spent in the same
   * statement that checks it is live, so two clicks on Join accept once.
   * The invitation is held first, as Resend, Copy link and Revoke hold it,
   * so one revoked meanwhile is ended here, never accepted beside it.
   */
  private async join(
    tx: Transaction,
    invitation: Live,
    token: string,
    userId: string,
  ): Promise<void> {
    const [held] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.id, invitation.id),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .for('update');
    if (!held) throw ended();

    const spent = await this.tokens.consumeInvitation(tx, token);
    if (spent !== invitation.id) throw ended();

    const [membership] = await tx
      .insert(memberships)
      .values({ userId, organizationId: invitation.organizationId })
      .returning({ id: memberships.id });
    await giveRoles(
      tx,
      { id: membership.id, organizationId: invitation.organizationId },
      invitation.roleIds,
    );

    await tx
      .update(invitations)
      .set({ acceptedAt: new Date(), membershipId: membership.id })
      .where(
        and(eq(invitations.id, invitation.id), isNull(invitations.acceptedAt)),
      );
  }

  /**
   * Already a member here, or of another organization: one person in two
   * is deferred (ADR-077), so the second is refused with the reason, to
   * the person who owns the address and nobody else.
   */
  private refuseHeld(
    held: { organizationId: string }[],
    invitation: Live,
  ): void {
    if (
      held.some((each) => each.organizationId === invitation.organizationId)
    ) {
      throw new ConflictException(
        t({
          id: 'invitations.alreadyJoined',
          defaultMessage: 'You are already a member of this organization.',
        }),
      );
    }
    if (held.length > 0) {
      throw new ConflictException(
        t({
          id: 'invitations.otherOrganization',
          defaultMessage:
            'Your account already belongs to another organization, and an account can belong to only one for now. Leave it first, or ask for an invitation to another address.',
        }),
      );
    }
  }

  /** Nobody joins an organization being deleted (ADR-070, ADR-077). */
  private refuseDeleting(invitation: Live): void {
    if (invitation.organizationDeleting) {
      throw new ConflictException(
        t({
          id: 'invitations.joinDeleting',
          defaultMessage:
            'This organization is being deleted, so nobody can join it.',
        }),
      );
    }
  }

  /**
   * Both sides' records, once the acceptance has committed: the account's
   * history (ADR-022), and the organization's log with the new member as
   * its actor (ADR-077), written by hand since the route is public and
   * the actor exists only now. Neither fails what has happened.
   */
  private async recorded(
    userId: string,
    invitation: Live,
    meta: EventMeta,
    verified: boolean,
  ): Promise<void> {
    await this.events.record(userId, 'account.invitation_accepted', meta);
    if (verified) {
      await this.events.record(userId, 'account.email_verified', meta);
    }

    try {
      await runInTenantContext(
        { userId, organizationId: invitation.organizationId },
        () =>
          this.audit.record({
            actorId: userId,
            action: AUDIT_ACTIONS.INVITATION_ACCEPTED,
            resourceType: 'invitation',
            resourceId: invitation.id,
            payload: { roleIds: invitation.roleIds },
            ip: meta.ip,
            userAgent: meta.userAgent,
          }),
      );
    } catch (error) {
      this.logger.error(`Audit write failed: ${String(error)}`);
    }
  }

  /**
   * The inviter hears in the bell, in their own language, that the person
   * they invited has joined, and opens the newcomer's page on People
   * (ADR-079); while still a member here, as the email and the invitation
   * page name them (ADR-077). The bell alone, not email: it is not a
   * security event (ADR-037). Once the acceptance has committed, and never
   * failing what has happened.
   */
  private async tellInviter(
    userId: string,
    name: string,
    invitation: Live,
  ): Promise<void> {
    try {
      const [facts] = await this.db
        .select({
          inviterId: memberships.userId,
          organizationName: organizations.name,
        })
        .from(invitations)
        .innerJoin(memberships, inviterStillHere)
        .innerJoin(users, eq(users.id, invitations.invitedBy))
        .innerJoin(
          organizations,
          eq(organizations.id, invitations.organizationId),
        )
        .where(and(eq(invitations.id, invitation.id), isNull(users.deletedAt)));
      if (!facts) return;

      const named = await rolesOfInvitation(this.db, invitation.id);

      await this.notifications.emit([
        {
          userId: facts.inviterId,
          organizationId: invitation.organizationId,
          type: NOTIFICATION_TYPES.INVITATION_ACCEPTED,
          title: t(
            {
              id: 'notifications.joined.title',
              defaultMessage: '{name} joined',
            },
            { name },
          ),
          body: t(
            {
              id: 'notifications.joined.body',
              defaultMessage:
                '{name} accepted your invitation and joined {organization} as {system, select, Owner {an {role}} Admin {an {role}} Viewer {a {role}} other {{role}}}.',
            },
            {
              name,
              organization: facts.organizationName,
              // Stored and worded again on each read (ADR-036), so the
              // placeholder keeps its name from before ADR-080, when it
              // held one role, and now holds the list: a row stored then
              // still reads.
              role: named.map(roleName),
              system: systemOf(named),
            },
          ),
          resourceType: 'user',
          resourceId: userId,
        },
      ]);
    } catch (error) {
      this.logger.error(`Telling the inviter failed: ${String(error)}`);
    }
  }

  /**
   * The logo, small, as a PNG data: URL for a page that shows it at 32 px
   * (ADR-077): a signed-out page cannot read the file route, and one
   * request is all it makes. Null rather than a failed page when the file
   * cannot be read.
   */
  private async logoOf(
    organizationId: string,
    fileId: string,
  ): Promise<string | null> {
    try {
      const [file] = await this.db
        .select({
          id: files.id,
          organizationId: files.organizationId,
          userId: files.userId,
        })
        .from(files)
        .where(
          and(
            eq(files.id, fileId),
            eq(files.organizationId, organizationId),
            isNull(files.releasedAt),
          ),
        );
      if (!file) return null;

      const chunks: Buffer[] = [];
      for await (const chunk of await this.storage.get(
        keyOf(ownerOf(file), file.id, 'full'),
      )) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      const mark = await renderLogoMark(Buffer.concat(chunks));
      return `data:image/png;base64,${mark.toString('base64')}`;
    } catch (error) {
      this.logger.warn(`Could not read logo ${fileId}: ${String(error)}`);
      return null;
    }
  }
}

/** Signed in as another address: the page signs out, then opens it again. */
export function otherAccount(email: string): ForbiddenException {
  return new ForbiddenException(
    t(
      {
        id: 'invitations.otherAccount',
        defaultMessage:
          'This invitation is for {email}. Sign out, then open the link again.',
      },
      { email },
    ),
  );
}

/** Accepting with no account takes a name and a password. */
export function nameAndPassword(): BadRequestException {
  return new BadRequestException(
    t({
      id: 'invitations.nameAndPassword',
      defaultMessage:
        'Give your name and choose a password to accept the invitation.',
    }),
  );
}

/** The address has an account: the page signs in, then joins. */
export function signInFirst(): ConflictException {
  return new ConflictException(
    t({
      id: 'invitations.signInFirst',
      defaultMessage:
        'This address already has an account. Sign in, then accept the invitation.',
    }),
  );
}

/**
 * The account's deletion is scheduled (ADR-069): the page offers Keep my
 * account, then Join, so the refusal carries its code and the day.
 */
function deletionScheduled(day: string): ConflictException {
  return new ConflictException(
    withCode(
      t(
        {
          id: 'invitations.deletionScheduled',
          defaultMessage:
            'Your account is set to be deleted after {day}. Keep your account, then join.',
        },
        { day },
      ),
      ERROR_CODES.accountDeletionScheduled,
      { day },
    ),
  );
}
