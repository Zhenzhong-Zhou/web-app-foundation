import { BadRequestException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';

import type { Translatable } from '../i18n/translate';
import type { Transaction } from './database.module';
import { locations, partners, productVariants } from './schema';

/** The tables a body's ids are checked against so far. */
type OwnedTable = typeof productVariants | typeof locations | typeof partners;

/**
 * A foreign key takes a row of any organization, so each id a body names is
 * looked for in the caller's first: another tenant's row, or one that does
 * not exist, is refused as unknown, a 400, before anything is written
 * (ADR-003). Nothing is deleted from these tables, so no foreign key can fail
 * after the check. An absent id (undefined or null) is not checked.
 */
export async function assertOwnIds(
  tx: Transaction,
  table: OwnedTable,
  organizationId: string,
  ids: readonly (string | null | undefined)[],
  message: Translatable,
): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return;

  const found = await tx
    .select({ id: table.id })
    .from(table)
    .where(
      and(eq(table.organizationId, organizationId), inArray(table.id, wanted)),
    );

  if (found.length !== wanted.length) throw new BadRequestException(message);
}
