import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Locale } from '../../common/locales';
import { operatorEmail } from '../../common/registration';
import type { Database, Transaction } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { isUniqueViolation } from '../../database/errors';
import { organizationInvitations, users } from '../../database/schema';
import { t } from '../../i18n/translate';
import { MailService } from '../../shared/mail/mail.service';
import { MailBrand } from '../../shared/mail/mail-brand';
import {
  AccountEventService,
  type EventMeta,
} from '../auth/account-event.service';
import { type AuthenticatedUser, AuthService } from '../auth/auth.service';
import { AuthTokenService } from '../auth/auth-token.service';
import { PasswordService } from '../auth/password.service';
import type { RequestContext } from '../auth/request-context';
import { type NewSession, SessionService } from '../auth/session.service';
import { SYSTEM_ROLES } from '../authorization/permissions';
import { roleWords } from '../authorization/role-words';
import {
  holdAccount,
  startOrganization,
} from '../organizations/start-organization';
import type { AcceptInvitationDto } from './dto/accept-invitation.dto';
import type { OrganizationInvitationPreview } from './dto/invitation-response.dto';
import {
  ended,
  nameAndPassword,
  otherAccount,
  signInFirst,
} from './invitation-acceptance.service';
import { organizationStartedMail } from './operator-mail';
import {
  lockAddress,
  organizationLinkLastDay,
} from './organization-invitations';

/** An organization invitation whose link is live. */
interface Live {
  id: string;
  email: string;
  organizationName: string;
  locale: Locale;
  expiresAt: Date;
}

/**
 * The invited person's half of an organization invitation (ADR-078):
 * reading it and accepting it, by the link alone, signed out or in. The
 * operator's half is organization-invitations.ts, which the command runs.
 *
 * Accepting makes the organization, in registration's transaction: the
 * account when the address has none, the organization with its roles and
 * numbering, and the Owner membership, so none exists without its Owner
 * (ADR-004). Nothing was emailed, so nothing is verified: the usual
 * verification email follows, and inviting waits for it (ADR-077).
 *
 * Uses the unscoped handle: a link is read before any organization exists,
 * as ADR-077's acceptance does (eslint.config.mjs).
 */
@Injectable()
export class OrganizationInvitationAcceptanceService {
  private readonly logger = new Logger(
    OrganizationInvitationAcceptanceService.name,
  );

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly tokens: AuthTokenService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly events: AccountEventService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly brand: MailBrand,
  ) {}

  /** Whether a live link is an organization invitation's. */
  async owns(token: string): Promise<boolean> {
    return (await this.tokens.findOrganizationInvitation(token)) !== null;
  }

  /**
   * What the page shows, and nothing more: the address, the organization
   * it starts, the Owner's role in the page's language, the link's last
   * day, whether the address has an account, and the language to start
   * in. Null for a link used, expired, replaced or revoked, all alike.
   * Spends nothing.
   */
  async read(
    token: string,
    locale: Locale,
  ): Promise<OrganizationInvitationPreview | null> {
    const row = await this.find(token);
    if (!row) return null;

    const [account] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(sql`lower(${users.email})`, row.email));

    return {
      email: row.email,
      organizationName: row.organizationName,
      role: roleWords(
        { name: SYSTEM_ROLES.OWNER, description: null, isSystem: true },
        locale,
      ),
      lastDay: organizationLinkLastDay(row.expiresAt),
      hasAccount: account !== undefined,
      locale: row.locale,
    };
  }

  /**
   * Accepting, signed in as the invitation's address, with no
   * organization: the account the person has becomes the new
   * organization's Owner, and the session moves to it. This is ADR-070's
   * "starting a new organization from an existing account".
   *
   * Refused when the session is another address's, when the account
   * already belongs to an organization, and while its deletion is
   * scheduled: Keep my account first, the link staying live meanwhile.
   */
  async acceptSignedIn(
    context: RequestContext,
    dto: AcceptInvitationDto,
    meta: EventMeta,
  ): Promise<AuthenticatedUser> {
    const invitation = await this.live(dto.token);

    if (context.email.toLowerCase() !== invitation.email) {
      throw otherAccount(invitation.email);
    }

    const { account, organizationId } = await this.db.transaction(
      async (tx) => {
        const { account, belongs } = await holdAccount(tx, context.userId);
        if (belongs) throw otherOrganization();
        if (account.deletionScheduledAt) {
          throw deletionScheduled(account.deletionScheduledAt);
        }

        const organizationId = await this.start(
          tx,
          invitation,
          dto,
          context.userId,
        );
        return { account, organizationId };
      },
    );

    await this.sessions.setCurrentOrg(context.sessionId, organizationId);
    await this.events.record(
      context.userId,
      'account.organization_started',
      meta,
    );

    const user: AuthenticatedUser = {
      id: context.userId,
      email: account.email,
      name: account.name,
      emailVerified: account.emailVerifiedAt !== null,
      locale: account.locale,
      organizationId,
    };
    await this.tellOperator(invitation, user);
    return user;
  }

  /**
   * Accepting with no account: the person names themselves and chooses the
   * password, and the account, the organization and its Owner membership
   * are written in one transaction, as at registration. Signed in after,
   * following Keep me signed in (ADR-065). The account takes the page's
   * language (ADR-077). Never verified: a printed link proves no inbox, so
   * the verification email follows.
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

    // Hashed before the transaction opens, as at registration.
    const passwordHash = await this.passwords.hash(password);
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
            emailVerifiedAt: null,
          })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            locale: users.locale,
          });

        const organizationId = await this.start(
          tx,
          invitation,
          dto,
          created.id,
        );

        return { ...created, emailVerified: false, organizationId };
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_lower_key')) {
        throw signInFirst();
      }
      throw error;
    }

    const session = await this.sessions.create(
      user.id,
      user.organizationId,
      meta,
      { keepSignedIn: dto.keepSignedIn ?? true },
    );
    // The account was opened, as by registering (ADR-022).
    await this.events.record(user.id, 'account.registered', meta);
    // Each send logs its own failure, so neither waits on the other.
    await Promise.all([
      this.auth.sendVerificationEmail(user.id, user.email, user.name, locale),
      this.tellOperator(invitation, user),
    ]);

    return { user, session };
  }

  /**
   * The organization invitation a live link is for, or null: used,
   * expired, replaced and revoked alike.
   */
  private async find(token: string): Promise<Live | null> {
    const id = await this.tokens.findOrganizationInvitation(token);
    if (!id) return null;

    const [row] = await this.db
      .select({
        id: organizationInvitations.id,
        email: organizationInvitations.email,
        organizationName: organizationInvitations.organizationName,
        locale: organizationInvitations.locale,
        expiresAt: organizationInvitations.expiresAt,
      })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.id, id),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
        ),
      );
    return row ?? null;
  }

  /** The organization invitation a live link is for, or ENDED. */
  private async live(token: string): Promise<Live> {
    const row = await this.find(token);
    if (!row) throw ended();
    return row;
  }

  /**
   * The organization and the acceptance, with the link spent in the same
   * statement that checks it is live, so two clicks on Set up start one.
   * The address is locked first, as the command locks it to replace or
   * revoke the invitation, so the two take turns: a link replaced or
   * revoked meanwhile is ended here, and a command that comes second
   * finds the invitation accepted.
   */
  private async start(
    tx: Transaction,
    invitation: Live,
    dto: AcceptInvitationDto,
    userId: string,
  ): Promise<string> {
    await lockAddress(tx, invitation.email);
    const [held] = await tx
      .select({ id: organizationInvitations.id })
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.id, invitation.id),
          isNull(organizationInvitations.acceptedAt),
          isNull(organizationInvitations.revokedAt),
        ),
      )
      .for('update');
    if (!held) throw ended();

    const spent = await this.tokens.consumeOrganizationInvitation(
      tx,
      dto.token,
    );
    if (spent !== invitation.id) throw ended();

    const organizationId = await startOrganization(tx, {
      name: invitation.organizationName,
      timeZone: dto.timeZone,
      userId,
    });

    await tx
      .update(organizationInvitations)
      .set({ acceptedAt: new Date(), startedOrganizationId: organizationId })
      .where(eq(organizationInvitations.id, invitation.id));

    this.logger.log(
      `Organization ${organizationId} started from invitation ${invitation.id}`,
    );
    return organizationId;
  }

  /**
   * OPERATOR_EMAIL, when set, hears of the acceptance (ADR-078). A send
   * that fails is logged and changes nothing: the organization exists, and
   * the email is a courtesy, not a record.
   */
  private async tellOperator(
    invitation: Live,
    owner: Pick<AuthenticatedUser, 'name' | 'email' | 'emailVerified'>,
  ): Promise<void> {
    const to = operatorEmail();
    if (!to) return;
    try {
      await this.mail.send(
        this.brand.withHeader(
          organizationStartedMail({
            to,
            organizationName: invitation.organizationName,
            name: owner.name,
            email: owner.email,
            verified: owner.emailVerified,
            at: new Date(),
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Could not tell the operator of invitation ${invitation.id}: ${String(error)}`,
      );
    }
  }
}

/** One person belongs to one organization until ADR-077's deferral. */
function otherOrganization(): ConflictException {
  return new ConflictException(
    t({
      id: 'invitations.organization.otherOrganization',
      defaultMessage:
        'Your account already belongs to an organization, and an account can belong to only one for now. Leave it first, or ask for a link to another address.',
    }),
  );
}

/**
 * The account's deletion is scheduled (ADR-069): the page offers Keep my
 * account, then Set up, so the refusal carries ADR-077's code and the day.
 */
function deletionScheduled(day: string): ConflictException {
  return new ConflictException(
    withCode(
      t(
        {
          id: 'invitations.organization.deletionScheduled',
          defaultMessage:
            'Your account is set to be deleted after {day}. Keep your account, then set up the organization.',
        },
        { day },
      ),
      ERROR_CODES.accountDeletionScheduled,
      { day },
    ),
  );
}
