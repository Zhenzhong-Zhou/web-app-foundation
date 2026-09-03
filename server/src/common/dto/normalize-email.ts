import { Transform } from 'class-transformer';

/**
 * Trims and lowercases. Email is case-insensitive in practice and the unique
 * index is on `lower(email)`, so storing mixed case would let two rows differ
 * only by casing at the application level while colliding at the database
 * level.
 *
 * Not a general string normaliser — lowercasing a SKU or a name would change
 * what the person typed, and a label printed as VD3-60 should not read back as
 * vd3-60.
 */
export const normalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
