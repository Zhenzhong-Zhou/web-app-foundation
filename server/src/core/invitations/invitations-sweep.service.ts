import { Inject, Injectable } from '@nestjs/common';
import { and, isNull, lt, or } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { invitations, organizationInvitations } from '../../database/schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** An ended invitation stays this long, then goes (ADR-077, ADR-078). */
export const SWEEP_AFTER_DAYS = 30;

/**
 * Deletes the invitations nobody accepted, 30 days after their link
 * expired or they were revoked: an address nobody accepted is not the
 * organization's to keep (ADR-077). Their links go with them. An accepted
 * one stays with its membership.
 *
 * Organization invitations the same way (ADR-078): an address nobody
 * accepted for is not ours to keep either. An accepted one stays with the
 * organization it started.
 *
 * Every organization's, in one hourly pass with no request, so the one
 * file here besides acceptance allowed the global connection
 * (eslint.config.mjs).
 */
@Injectable()
export class InvitationsSweepService {
  constructor(@Inject(UNSAFE_GLOBAL_DB) private readonly db: Database) {}

  async sweep(now = new Date()): Promise<number> {
    const before = new Date(now.getTime() - SWEEP_AFTER_DAYS * DAY_MS);
    const deleted = await this.db
      .delete(invitations)
      .where(
        and(
          isNull(invitations.acceptedAt),
          or(
            lt(invitations.revokedAt, before),
            lt(invitations.expiresAt, before),
          ),
        ),
      )
      .returning({ id: invitations.id });
    const deletedOffers = await this.db
      .delete(organizationInvitations)
      .where(
        and(
          isNull(organizationInvitations.acceptedAt),
          or(
            lt(organizationInvitations.revokedAt, before),
            lt(organizationInvitations.expiresAt, before),
          ),
        ),
      )
      .returning({ id: organizationInvitations.id });
    return deleted.length + deletedOffers.length;
  }
}
