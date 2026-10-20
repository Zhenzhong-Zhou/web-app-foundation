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
import { organizations } from './organizations';

/**
 * An organization invitation (ADR-078): the operator's offer to one
 * address to start one named organization, as its Owner. The link itself
 * is an auth_tokens row of purpose `organization_invitation`; this row
 * holds everything else.
 *
 * **No organization_id.** The organization does not exist until the
 * invitation is accepted, and is made then, in registration's transaction,
 * so none ever exists without its Owner (ADR-004). The row is the
 * operator's, not a tenant's: TenantDb never reads it, and the
 * organization it started is `started_organization_id`, a different name
 * on purpose, so nothing mistakes it for a tenant column.
 *
 * Waiting until accepted or revoked. An accepted one stays with the
 * organization it started, so "did they accept?" has an answer, and goes
 * with it; an expired or revoked one is deleted 30 days later by the
 * hourly timer that sweeps ADR-077's invitations.
 */
export const organizationInvitations = pgTable(
  'organization_invitations',
  {
    id: primaryKey(),

    // Lowercased by the command, as users.email is by its DTOs.
    email: text('email').notNull(),

    /**
     * The organization's name as the operator gave it. Fixed on the
     * invitation page, and changed on Profile afterwards (ADR-061).
     */
    organizationName: text('organization_name').notNull(),

    /**
     * The language the page starts in, and the message the command prints
     * (ADR-078). A tag from SUPPORTED_LOCALES, checked by the command.
     */
    locale: text('locale').$type<Locale>().notNull(),

    /**
     * When the latest link stops working: its seventh day ended everywhere,
     * noon UTC the day after (ADR-078), there being no organization's zone
     * to end it in yet. Kept here for the list and the sweep, since a
     * spent token may already be gone.
     */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),

    // CASCADE: an accepted invitation goes when the organization it
    // started is deleted (ADR-070).
    startedOrganizationId: uuid('started_organization_id').references(
      () => organizations.id,
      { onDelete: 'cascade' },
    ),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    // One waiting invitation per address. Waiting is what no one has
    // accepted or revoked: an expired one still is, and running the
    // command again replaces it. now() cannot sit in an index, which is
    // why expiry is not part of it.
    uniqueIndex('organization_invitations_waiting_email_key')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.acceptedAt} is null and ${t.revokedAt} is null`),
    index('organization_invitations_started_organization_id_idx').on(
      t.startedOrganizationId,
    ),
    // Accepted is exactly having started an organization, and never once
    // revoked.
    check(
      'organization_invitations_accepted_check',
      sql`(${t.acceptedAt} is null) = (${t.startedOrganizationId} is null) and (${t.acceptedAt} is null or ${t.revokedAt} is null)`,
    ),
  ],
);
