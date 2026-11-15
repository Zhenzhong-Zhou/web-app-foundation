import type { IntlShape } from 'react-intl';

import type { ProductNameToChoose } from '../api/types.gen';
import type { NameKeep } from '../lib/api-names';

/**
 * The rows of the list that choosing the items' language shows (ADR-054,
 * amended for #531), kept out of the components' files so they export
 * components alone.
 */

/**
 * A row as it was shown: its item or variant and the four texts. A choice
 * is kept under it, so a row whose names changed since is a row of its
 * own, with no choice yet, as the server, which refuses it, sees it.
 */
export function identityOf(row: ProductNameToChoose): string {
  return JSON.stringify([
    row.kind,
    row.id,
    row.ownName,
    row.keptName,
    row.ownDescription,
    row.keptDescription,
  ]);
}

/**
 * Whether the row shows its descriptions too: the kept one written, and
 * not the own one, so choosing the name chooses it with it.
 */
export function descriptionsDiffer(row: ProductNameToChoose): boolean {
  return !!row.keptDescription && row.keptDescription !== row.ownDescription;
}

/**
 * The list read again after the server refused it as changed: the rows
 * new since, a row that changed among them, and those gone, by their
 * item or variant.
 */
export function readAgain(
  before: readonly ProductNameToChoose[],
  rows: readonly ProductNameToChoose[],
): { fresh: Set<string>; gone: ProductNameToChoose[] } {
  const shown = new Set(before.map(identityOf));
  const standing = new Set(rows.map((row) => `${row.kind}:${row.id}`));
  return {
    fresh: new Set(
      rows.map(identityOf).filter((identity) => !shown.has(identity)),
    ),
    gone: before.filter((row) => !standing.has(`${row.kind}:${row.id}`)),
  };
}

/** A row by its item's own name, or a variant by its code. */
export function rowName(row: ProductNameToChoose, intl: IntlShape): string {
  return row.kind === 'variant' && row.sku !== null
    ? intl.formatMessage(
        { id: 'products.names.kind.variant', defaultMessage: 'Variant {sku}' },
        { sku: row.sku },
      )
    : (row.ownName ?? row.keptName);
}

/** A row's radio, for the dialog to bring focus to it. */
export function radioId(
  prefix: string,
  row: ProductNameToChoose,
  keep: NameKeep,
): string {
  return `${prefix}-${row.kind}-${row.id}-${keep}`;
}
