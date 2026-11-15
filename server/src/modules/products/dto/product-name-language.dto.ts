import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsLocale } from '../../../common/dto/locale';
import type { Locale } from '../../../common/locales';
import { defineMessage, rule } from '../../../i18n/validation';
import { MAX_CHANGED_AT_ONCE } from './change-products.dto';

/** The language whose choice is previewed (ADR-054, amended for #531). */
export class ProductNameLanguageQueryDto {
  @IsLocale()
  language!: Locale;
}

/**
 * One row of the list, as it was shown, with the name chosen: the own
 * name, which removes the kept one, or the kept one, which becomes the
 * own. The names and descriptions shown are sent back as they were, never
 * tidied, so the save can tell the row has not changed since.
 */
export class ProductNameChoiceDto {
  @IsIn(['item', 'variant'])
  kind!: 'item' | 'variant';

  /** The item's id, or the variant's. */
  @IsUUID()
  id!: string;

  /** Left out, or null, for a row not chosen yet, which the save refuses. */
  @IsOptional()
  @IsIn(['own', 'kept'])
  keep?: 'own' | 'kept' | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownName?: string | null;

  @IsString()
  @MaxLength(200)
  keptName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  ownDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  keptDescription?: string | null;
}

const EACH_ROW_ONCE = {
  message: rule(
    defineMessage({
      id: 'validation.nameRowTwice',
      defaultMessage: 'A row appears twice — send each one once',
    }),
  ),
};

/**
 * The language the items are named in, and a choice for each name kept in
 * it that differs from its own (ADR-054, amended for #531). Never null:
 * once set, the language is never set back to not set.
 */
export class ChooseProductNameLanguageDto {
  @IsLocale()
  language!: Locale;

  @IsArray()
  @ArrayMaxSize(MAX_CHANGED_AT_ONCE)
  @ArrayUnique(
    (choice?: ProductNameChoiceDto) => `${choice?.kind}:${choice?.id}`,
    EACH_ROW_ONCE,
  )
  @ValidateNested({ each: true })
  @Type(() => ProductNameChoiceDto)
  choices!: ProductNameChoiceDto[];
}
