import { Transform } from 'class-transformer';

/**
 * Strips surrounding whitespace before validation runs.
 *
 * Applied to every free-text field a person types: a name of `"  "` passes
 * @MinLength(1) without this, and a SKU with a trailing space is a different
 * SKU to the unique index — the collision it should have caused never happens,
 * and two variants end up looking identical in every UI.
 */
export const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
