import {
  BadRequestException,
  type ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationArguments } from 'class-validator';

// Aliased: the extractor reads every t() call as a message definition, and
// this one passes a descriptor through rather than defining one.
import { t as render, type Translatable } from './translate';

/**
 * Validation messages in the request's language (ADR-054).
 *
 * The English a client or the e2e suite reads is class-validator's own,
 * flattened by Nest exactly as before ("lines.0.quantity must be …"): this
 * pipe changes none of it. Beside each sentence it keeps a message id and
 * its values, which AllExceptionsFilter renders in the request's language.
 * The screens check before sending, so a person seldom meets these; the
 * field's API name stays as it is, which is what an integrator reads.
 */

/** A descriptor the extractor reads into en.json; nothing more. */
export function defineMessage<T extends { id: string; defaultMessage: string }>(
  descriptor: T,
): T {
  return descriptor;
}

/** Built-in rules, by class-validator's constraint name. */
const BUILT_IN: Record<string, { id: string; defaultMessage: string }> = {
  isString: defineMessage({
    id: 'validation.isString',
    defaultMessage: '{property} must be a string',
  }),
  maxLength: defineMessage({
    id: 'validation.maxLength',
    defaultMessage:
      '{property} must be shorter than or equal to {limit} characters',
  }),
  minLength: defineMessage({
    id: 'validation.minLength',
    defaultMessage:
      '{property} must be longer than or equal to {limit} characters',
  }),
  isUuid: defineMessage({
    id: 'validation.isUuid',
    defaultMessage: '{property} must be a UUID',
  }),
  isBoolean: defineMessage({
    id: 'validation.isBoolean',
    defaultMessage: '{property} must be a boolean value',
  }),
  isBooleanString: defineMessage({
    id: 'validation.isBooleanString',
    defaultMessage: '{property} must be a boolean string',
  }),
  isIn: defineMessage({
    id: 'validation.isIn',
    defaultMessage: '{property} must be one of the following values: {values}',
  }),
  isArray: defineMessage({
    id: 'validation.isArray',
    defaultMessage: '{property} must be an array',
  }),
  isInt: defineMessage({
    id: 'validation.isInt',
    defaultMessage: '{property} must be an integer number',
  }),
  isPositive: defineMessage({
    id: 'validation.isPositive',
    defaultMessage: '{property} must be a positive number',
  }),
  min: defineMessage({
    id: 'validation.min',
    defaultMessage: '{property} must not be less than {limit}',
  }),
  max: defineMessage({
    id: 'validation.max',
    defaultMessage: '{property} must not be greater than {limit}',
  }),
  arrayMinSize: defineMessage({
    id: 'validation.arrayMinSize',
    defaultMessage: '{property} must contain at least {limit} elements',
  }),
  arrayMaxSize: defineMessage({
    id: 'validation.arrayMaxSize',
    defaultMessage: '{property} must contain no more than {limit} elements',
  }),
  arrayUnique: defineMessage({
    id: 'validation.arrayUnique',
    defaultMessage: "All {property}'s elements must be unique",
  }),
  isEmail: defineMessage({
    id: 'validation.isEmail',
    defaultMessage: '{property} must be an email',
  }),
  isDefined: defineMessage({
    id: 'validation.isDefined',
    defaultMessage: '{property} should not be null or undefined',
  }),
  isNotEmpty: defineMessage({
    id: 'validation.isNotEmpty',
    defaultMessage: '{property} should not be empty',
  }),
  isDate: defineMessage({
    id: 'validation.isDate',
    defaultMessage: '{property} must be a Date instance',
  }),
  isIso8601: defineMessage({
    id: 'validation.isIso8601',
    defaultMessage: '{property} must be a valid ISO 8601 date string',
  }),
  matches: defineMessage({
    id: 'validation.matches',
    defaultMessage: '{property} is not in the expected form',
  }),
  whitelistValidation: defineMessage({
    id: 'validation.whitelist',
    defaultMessage: 'property {property} should not exist',
  }),
  nestedValidation: defineMessage({
    id: 'validation.nested',
    defaultMessage: 'nested property {property} must be either object or array',
  }),
};

/** A DTO's own message, as written, against the id it was written from. */
const written = new Map<string, Translatable>();

/**
 * A DTO rule's own message, for a decorator's `message` option. Its English
 * is the defaultMessage with the field's name for {property}, as
 * class-validator's `$property` gave before; the id goes with it.
 */
export function rule(descriptor: { id: string; defaultMessage: string }) {
  return (args: ValidationArguments): string => {
    const message = render(descriptor, { property: args.property });
    written.set(message.message, message);
    return message.message;
  };
}

/**
 * The field's path as the English prints it: Nest puts a nested field's
 * parents in front of its sentence (lines.0.quantity must …), while the
 * error itself names only the field (quantity).
 */
function pathIn(english: string, field: string): string {
  const at = english.indexOf(field);
  const parents = at > 0 ? english.slice(0, at) : '';
  return /^([\w-]+\.)+$/.test(parents) ? parents + field : field;
}

/**
 * What a failed constraint says, with its id; a number or a list the
 * English carries is read back out of it for the other languages.
 */
function translatable(
  key: string,
  english: string,
  field: string,
): Translatable {
  const property = pathIn(english, field);

  for (const [sentence, message] of written) {
    if (english === sentence || english.endsWith(`.${sentence}`)) {
      return { ...message, message: english, values: { property } };
    }
  }

  const builtIn = BUILT_IN[key];
  if (!builtIn) return { message: english, messageId: `validation.${key}` };

  const after = english.slice(english.indexOf(property) + property.length);
  return {
    message: english,
    messageId: builtIn.id,
    values: {
      property,
      limit: /(\d+)/.exec(after)?.[1] ?? '',
      values: english.split(': ').slice(1).join(': '),
    },
  };
}

/**
 * The application's ValidationPipe: the same options and the same English,
 * with each message's id kept for the filter.
 */
export class TranslatingValidationPipe extends ValidationPipe {
  public override createExceptionFactory() {
    return (errors: ValidationError[] = []) => {
      const leaves = errors
        .flatMap((error) => this.mapChildrenToValidationErrors(error))
        .filter((error) => error.constraints);

      const messages = leaves.flatMap((error) =>
        Object.entries(error.constraints ?? {}).map(([key, english]) =>
          translatable(key, english, error.property),
        ),
      );

      return new BadRequestException({
        message: messages.map((message) => message.message),
        messages,
      });
    };
  }
}
