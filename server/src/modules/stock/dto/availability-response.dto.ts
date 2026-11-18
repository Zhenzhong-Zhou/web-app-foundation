/**
 * An order's holds as the API returns them (ADR-068, ADR-045), described
 * for the OpenAPI document by the CLI plugin.
 */

/** One confirmed sale line's hold (ADR-045). */
export class LineHold {
  lineId!: string;
  outstanding!: string;
  held!: string;
  short!: string;
}
