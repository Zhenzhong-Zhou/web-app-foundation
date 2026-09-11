import { Transform } from 'class-transformer';

/**
 * Uppercases a string before validation runs.
 *
 * Paired with a @Matches on the uppercase form, so "ca" is accepted and stored
 * as "CA". Refusing lowercase would be pedantry — the input is unambiguous —
 * but storing both spellings would make them two different countries to every
 * filter and every unique index.
 *
 * Trims first, like @trim(), so the two are not order-dependent when both are
 * applied to the same field.
 */
export const upper = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );
