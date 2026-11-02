import { type SQL, sql } from 'drizzle-orm';

/**
 * A recipe line's quantity for a run of `planned`: the line's quantity
 * times the run's share of the recipe's batch, to four places, worked out
 * in Postgres (ADR-025, ADR-032). Read on the recipe line as `bl`.
 *
 * The one expression release issues by, its issue plan shows, and the run
 * dialog's preview shows before the run is planned (ADR-085), so what a
 * person is shown is what the run will use.
 */
export function scaledQuantity(planned: string, batch: string): SQL {
  return sql`round(bl.quantity * (${planned}::numeric / ${batch}::numeric), 4)`;
}
