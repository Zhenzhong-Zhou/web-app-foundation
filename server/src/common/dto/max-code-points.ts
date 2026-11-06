import { buildMessage, ValidateBy } from 'class-validator';

/**
 * At most `limit` characters as Postgres's `char_length` counts them, one
 * per code point. class-validator's `MaxLength` counts an emoji's
 * variation selector as nothing ("✔️" is 1, Postgres says 2), so a value it
 * passes could still fail the column's check and answer 500 (ADR-091).
 *
 * Named `maxLength`, with its English, so the refusal reads and translates
 * as `MaxLength`'s does.
 */
export const MaxCodePoints = (limit: number) =>
  ValidateBy({
    name: 'maxLength',
    constraints: [limit],
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && [...value].length <= limit,
      defaultMessage: buildMessage(
        (each) =>
          `${each}$property must be shorter than or equal to $constraint1 characters`,
      ),
    },
  });
