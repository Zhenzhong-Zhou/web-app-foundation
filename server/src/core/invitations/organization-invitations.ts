import { and, desc, eq, gt, isNull, lte, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { addDays, dayIn, todayIn } from '../../common/today';
import type { Database, Transaction } from '../../database/database.module';
import {
  authTokens,
  memberships,
  organizationInvitations,
  users,
} from '../../database/schema';
import { t, translate } from '../../i18n/translate';
import { dayOf } from '../auth/deletion-mail';
import { hashToken, newToken } from '../auth/token-hash';
import { SWEEP_AFTER_DAYS } from './invitations-sweep.service';

/**
 * Organization invitations (ADR-078), as plain functions over a database
 * handle: `npm run org:invite` runs them from the operator's laptop, with
 * no Nest application, and the operator's console will call the same ones.
 * Nothing here sends mail.
 */

type Executor = Database | Transaction;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** How many days a link lasts, as an invitation to join does (ADR-077). */
const ORGANIZATION_LINK_DAYS = 7;

/**
 * When a link issued now stops working (ADR-078). There is no organization
 * yet, so no zone to end a day in: the last day is the seventh after
 * today in UTC, and the link works until that day has ended everywhere,
 * noon UTC the day after, as ADR-070's cancel cutoff. "Until 27 October"
 * then holds wherever the person is.
 */
export function organizationLinkEnd(now: Date = new Date()): {
  lastDay: string;
  expiresAt: Date;
} {
  const lastDay = addDays(todayIn('UTC', now), ORGANIZATION_LINK_DAYS);
  return {
    lastDay,
    expiresAt: new Date(`${addDays(lastDay, 1)}T12:00:00.000Z`),
  };
}

/** A link's last day, YYYY-MM-DD: the day its end closes everywhere. */
export function organizationLinkLastDay(expiresAt: Date): string {
  return dayIn('UTC', new Date(expiresAt.getTime() - 12 * HOUR - 1));
}

/** The page a link opens, among the signed-out pages, as ADR-077's. */
export function organizationInvitationLink(
  clientUrl: string,
  token: string,
): string {
  return `${clientUrl.replace(/\/+$/, '')}/invitation?token=${token}`;
}

/**
 * The short message the command prints under the link, in the
 * invitation's language, for the operator to paste whole into a chat or
 * an email (ADR-078). The link goes on the line after it.
 */
export function organizationInvitationMessage(
  locale: Locale,
  organizationName: string,
  lastDay: string,
): string {
  return translate(
    t(
      {
        id: 'invitations.organization.message',
        defaultMessage:
          'You’re invited to set up {organization}. Open the link below by the end of {date} to create your account and the organization:',
      },
      { organization: organizationName, date: dayOf(lastDay, locale) },
    ),
    locale,
  );
}

/** An organization invitation not yet accepted or revoked. */
export interface WaitingInvitation {
  id: string;
  email: string;
  organizationName: string;
  locale: Locale;
  expiresAt: Date;
}

/**
 * The invitation waiting for an address, ended or not: there is at most
 * one (the partial unique index), and running the command again replaces
 * it.
 */
export async function waitingFor(
  db: Executor,
  email: string,
): Promise<WaitingInvitation | null> {
  const [row] = await db
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
        eq(sql`lower(${organizationInvitations.email})`, normalized(email)),
        isNull(organizationInvitations.acceptedAt),
        isNull(organizationInvitations.revokedAt),
      ),
    );
  return row ?? null;
}

/**
 * Whether the address's account belongs to an organization: a person
 * belongs to one until ADR-077's one person in two organizations.
 */
export async function belongsToAnOrganization(
  db: Executor,
  email: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(sql`lower(${users.email})`, normalized(email)))
    .limit(1);
  return row !== undefined;
}

/** Why an invitation was not issued, for the command to say. */
export class OrganizationInvitationRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrganizationInvitationRefused';
  }
}

export interface IssuedOrganizationInvitation {
  /** The only time the secret exists: printed, never stored. */
  token: string;
  link: string;
  lastDay: string;
  /** True when it replaced one waiting for the same address. */
  replaced: boolean;
}

/**
 * Issues an organization invitation, or replaces the one waiting for the
 * address: its old link stops working, a new one starts its seven days,
 * and the name and language become the new ones. One transaction, under a
 * lock on the address, so two runs at once cannot both issue, and an
 * acceptance takes its turn before or after.
 *
 * Refused for an address whose account belongs to an organization, and,
 * should the one waiting have been accepted all the same, not replaced.
 */
export async function issueOrganizationInvitation(
  db: Database,
  input: { email: string; organizationName: string; locale: Locale },
  clientUrl: string,
  now: Date = new Date(),
): Promise<IssuedOrganizationInvitation> {
  const email = normalized(input.email);
  const organizationName = input.organizationName.trim();

  return db.transaction(async (tx) => {
    await lockAddress(tx, email);

    if (await belongsToAnOrganization(tx, email)) {
      throw new OrganizationInvitationRefused(
        `${email} already belongs to an organization. For now an account belongs to one.`,
      );
    }

    const { lastDay, expiresAt } = organizationLinkEnd(now);
    const waiting = await waitingFor(tx, email);

    let id: string;
    if (waiting) {
      id = waiting.id;
      const [replaced] = await tx
        .update(organizationInvitations)
        .set({ organizationName, locale: input.locale, expiresAt })
        .where(
          and(
            eq(organizationInvitations.id, id),
            isNull(organizationInvitations.acceptedAt),
          ),
        )
        .returning({ id: organizationInvitations.id });
      if (!replaced) {
        throw new OrganizationInvitationRefused(
          `${email} accepted the invitation that was waiting, so it was not replaced.`,
        );
      }
      // Its old links go: a replaced one reads as ended, as an unknown one.
      await tx
        .delete(authTokens)
        .where(eq(authTokens.organizationInvitationId, id));
    } else {
      const [created] = await tx
        .insert(organizationInvitations)
        .values({ email, organizationName, locale: input.locale, expiresAt })
        .returning({ id: organizationInvitations.id });
      id = created.id;
    }

    const token = newToken();
    await tx.insert(authTokens).values({
      tokenHash: hashToken(token),
      organizationInvitationId: id,
      purpose: 'organization_invitation',
      expiresAt,
    });

    return {
      token,
      link: organizationInvitationLink(clientUrl, token),
      lastDay,
      replaced: waiting !== null,
    };
  });
}

/**
 * Revokes the invitation waiting for an address: its link stops working
 * at once, and the row goes with the sweep, 30 days on. False when nothing
 * was waiting, or what was has been accepted.
 */
export async function revokeOrganizationInvitation(
  db: Database,
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await lockAddress(tx, normalized(email));
    const waiting = await waitingFor(tx, email);
    if (!waiting) return false;

    const [revoked] = await tx
      .update(organizationInvitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(organizationInvitations.id, waiting.id),
          isNull(organizationInvitations.acceptedAt),
        ),
      )
      .returning({ id: organizationInvitations.id });
    if (!revoked) return false;

    await tx
      .delete(authTokens)
      .where(eq(authTokens.organizationInvitationId, waiting.id));
    return true;
  });
}

/** One line of the list: who, what, and the day that matters. */
export interface ListedInvitation {
  email: string;
  organizationName: string;
  /** The last day while waiting or ended; the day accepted, once it is. */
  day: string;
}

/**
 * What the operator asks with --list (ADR-078): those waiting; those whose
 * link ended unaccepted, so a customer who missed the seven days is not
 * forgotten; and those accepted. Ended and accepted ones for 30 days, as
 * long as the sweep keeps an unaccepted one. Revoked ones are not listed.
 */
export async function listOrganizationInvitations(
  db: Executor,
  now: Date = new Date(),
): Promise<{
  waiting: ListedInvitation[];
  ended: ListedInvitation[];
  accepted: ListedInvitation[];
}> {
  const since = new Date(now.getTime() - SWEEP_AFTER_DAYS * DAY);
  const columns = {
    email: organizationInvitations.email,
    organizationName: organizationInvitations.organizationName,
    expiresAt: organizationInvitations.expiresAt,
    acceptedAt: organizationInvitations.acceptedAt,
  };
  const unaccepted = and(
    isNull(organizationInvitations.acceptedAt),
    isNull(organizationInvitations.revokedAt),
  );

  const [waiting, ended, accepted] = await Promise.all([
    db
      .select(columns)
      .from(organizationInvitations)
      .where(and(unaccepted, gt(organizationInvitations.expiresAt, now)))
      .orderBy(organizationInvitations.expiresAt),
    db
      .select(columns)
      .from(organizationInvitations)
      .where(
        and(
          unaccepted,
          lte(organizationInvitations.expiresAt, now),
          gt(organizationInvitations.expiresAt, since),
        ),
      )
      .orderBy(desc(organizationInvitations.expiresAt)),
    db
      .select(columns)
      .from(organizationInvitations)
      .where(gt(organizationInvitations.acceptedAt, since))
      .orderBy(desc(organizationInvitations.acceptedAt)),
  ]);

  const listed = (row: (typeof waiting)[number]): ListedInvitation => ({
    email: row.email,
    organizationName: row.organizationName,
    day: row.acceptedAt
      ? dayIn('UTC', row.acceptedAt)
      : organizationLinkLastDay(row.expiresAt),
  });

  return {
    waiting: waiting.map(listed),
    ended: ended.map(listed),
    accepted: accepted.map(listed),
  };
}

/** An address as the table keeps it: lowercased, as users.email is. */
function normalized(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * One address's organization invitation, issued, replaced, revoked and
 * accepted one at a time: the command and an acceptance each take this
 * first, in their own transaction.
 */
export async function lockAddress(
  tx: Transaction,
  email: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`organization-invitations:${email}`}, 0))`,
  );
}
