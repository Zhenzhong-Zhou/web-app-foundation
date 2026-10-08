import { gte, lt, lte, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

/**
 * The conditions for a list's date range (ADR-057), to spread into its
 * filters. Either end may be absent; a reversed range simply finds nothing.
 */
export function calendarRange(
  column: AnyPgColumn,
  range: { from?: string; to?: string },
): SQL[] {
  return [
    range.from ? gte(column, range.from) : undefined,
    range.to ? lte(column, range.to) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);
}

/** As calendarRange, for an instant: `from` included, `until` excluded. */
export function instantRange(
  column: AnyPgColumn,
  range: { from?: string; until?: string },
): SQL[] {
  return [
    range.from ? gte(column, new Date(range.from)) : undefined,
    range.until ? lt(column, new Date(range.until)) : undefined,
  ].filter((condition): condition is SQL => condition !== undefined);
}
