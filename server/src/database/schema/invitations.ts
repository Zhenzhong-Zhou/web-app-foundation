import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { Locale } from '../../common/locales';
import { primaryKey, timestamps } from './columns';
import { memberships } from './memberships';
import { organizations } from './organizations';
import { users } from './users';

/**
 * How an invitation's live link went (ADR-077): emailed, copied for the
 * inviter to pass on, or an email that failed, whose link nobody received
 * and which was spent.
 */
export const INVITATION_LINKS = ['emailed', 'copied', 'not_sent'] as const;

export type InvitationLink = (typeof INVITATION_LINKS)[number];

/**
 * An invitation to join an organization (ADR-077): the address, the roles
 * it grants (invitation_roles, ADR-080) and the inviter's note. The link
 * itself is an auth_tokens row of purpose `invitation`, which a token can
 * say nothing beyond; this row and its roles hold everything else.
 *
 * Pending until accepted or revoked. An accepted one stays with the
 * membership it made, so its note can be read again, and goes with it;
 * an expired or revoked one is deleted 30 days later by the hourly timer.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: primaryKey(),

    // ADR-012: exists only to serve the organization.
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Lowercased by the DTO, as users.email is.
    email: text('email').notNull(),

    // The roles it grants are invitation_roles' rows (ADR-080).

    /**
     * The language to write to them in (ADR-077): the email's, and the
     * invitation page's to start with. A tag from SUPPORTED_LOCALES,
     * checked by the DTO.
     */
    locale: text('locale').$type<Locale>().notNull(),

    /** The inviter's message, plain text up to 500 characters. */
    note: text('note'),

    // RESTRICT, as audit_log.actor_id: an account is anonymised, never
    // removed (ADR-012), so the invitation keeps naming who sent it.
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    // Checked against INVITATION_LINKS by the constraint below.
    link: text('link').$type<InvitationLink>().notNull(),

    /**
     * When the latest link stops working: its token's expiry, kept here
     * for the list's last day and for the sweep, since a spent token may
     * already be gone.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // CASCADE: an accepted invitation goes when its membership ends.
    membershipId: uuid('membership_id').references(() => memberships.id, {
      onDelete: 'cascade',
    }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    // One pending invitation per address per organization. Pending is what
    // no one has accepted or revoked: an expired one still is, and Resend
    // brings it back. now() cannot sit in an index, which is why expiry
    // is not part of it.
    uniqueIndex('invitations_pending_email_key')
      .on(t.organizationId, sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index('invitations_organization_id_idx').on(t.organizationId),
    // What invitation_roles' foreign key names (ADR-080).
    uniqueIndex('invitations_id_org_key').on(t.id, t.organizationId),
    index('invitations_membership_id_idx').on(t.membershipId),
    check(
      'invitations_link_check',
      sql`${t.link} in ('emailed', 'copied', 'not_sent')`,
    ),
    // Accepted is exactly having made a membership, and never once revoked.
    check(
      'invitations_accepted_check',
      sql`(${t.acceptedAt} is null) = (${t.membershipId} is null) and (${t.acceptedAt} is null or ${t.revokedAt} is null)`,
    ),
  ],
);
