/**
 * Quantities and prices arrive as strings, never JSON numbers (ADR-025): a
 * JSON number has already been through a double before any validator sees
 * it. Up to 14 digits before the point and 4 after, matching numeric(18, 4).
 *
 * One copy, so a change to the rule lands in every DTO at once.
 */

/** Greater than zero — a quantity. Ordering 2.75 kg of raw material is ordinary. */
export const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

/** Zero or more — a price. A free replacement line is real (ADR-035). */
export const NON_NEGATIVE_DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;
