import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength, ValidateBy } from 'class-validator';

import { lookupLongEnough } from '../../../common/search';
import { defineMessage, rule } from '../../../i18n/validation';

const IsLookupQuery = () =>
  ValidateBy({
    name: 'isLookupQuery',
    validator: {
      validate: (value: unknown) =>
        typeof value === 'string' && lookupLongEnough(value),
      defaultMessage: rule(
        defineMessage({
          id: 'validation.lookupQuery',
          defaultMessage:
            '{property} must be at least 2 characters, or one Chinese character',
        }),
      ),
    },
  });

/** What the top bar's lookup sends (ADR-056). */
export class LookupQueryDto {
  /**
   * Trimmed before it is measured: "  a " is one character, refused; 鱼 is
   * one Chinese character, a search. MinLength(1) is what the OpenAPI
   * document can say of the rule.
   */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @IsLookupQuery()
  @MaxLength(100)
  q!: string;
}
