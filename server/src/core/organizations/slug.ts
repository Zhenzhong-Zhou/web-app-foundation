import { randomBytes } from 'node:crypto';

import { eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { organizations } from '../../database/schema';

/**
 * Produces a slug matching the check constraint on organizations.slug:
 * lowercase alphanumerics separated by single hyphens.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    // Strip diacritics so "Café" becomes "cafe" rather than being dropped.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // The collapse above leaves no run of hyphens, so one hyphen at each end
    // is all there is to trim, here and after the cut. A repeated hyphen in
    // these patterns would read to CodeQL as polynomial on a name of many
    // hyphens (js/polynomial-redos).
    .replace(/^-|-$/g, '')
    .slice(0, 48)
    .replace(/-$/, '');

  // "株式会社" and "!!!" both reduce to an empty string, which would violate
  // the constraint. Fall back rather than reject an otherwise valid org name.
  return slug || `org-${randomBytes(4).toString('hex')}`;
}

/**
 * A slug not already taken.
 *
 * The check is advisory, not a guarantee: two concurrent registrations can
 * both see the name as free. The unique index is the real defence — this only
 * avoids handing the common case an ugly suffix it doesn't need.
 */
export async function uniqueSlug(
  tx: Transaction,
  name: string,
): Promise<string> {
  const base = slugify(name);

  const taken = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, base));

  if (taken.length === 0) return base;

  // Random suffix rather than a counter: counting requires a scan, and two
  // concurrent registrations would pick the same number anyway.
  return `${base}-${randomBytes(3).toString('hex')}`;
}
