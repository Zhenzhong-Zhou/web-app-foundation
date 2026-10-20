import { and, eq } from 'drizzle-orm';

import { invitations, memberships } from '../../database/schema';

/**
 * The inviter's own membership in the invitation's organization, to join
 * on: an invitation is the organization's, and names its inviter only while
 * they are still a member there, never once they have left or deleted their
 * account (ADR-077). The email, the invitation page, the welcome on Home
 * and the inviter's notification (ADR-079) all go by it.
 */
export const inviterStillHere = and(
  eq(memberships.userId, invitations.invitedBy),
  eq(memberships.organizationId, invitations.organizationId),
);
