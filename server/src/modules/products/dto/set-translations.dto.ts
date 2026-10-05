import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsLocale } from '../../../common/dto/locale';
import { trim } from '../../../common/dto/trim';
import { type Locale, SUPPORTED_LOCALES } from '../../../common/locales';

/** A product's name, and optionally its description, in one language. */
export class ProductTranslationDto {
  @IsLocale()
  locale!: Locale;

  /** The base name's limit, so a translation fits wherever the name does. */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /** Empty or absent means none: the base description then shows. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}

/** A variant's name in one language: "60粒" beside "60ct". */
export class VariantTranslationDto {
  @IsLocale()
  locale!: Locale;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

const ONE_PER_LANGUAGE = {
  message: 'A language appears twice — send each one once',
};

/**
 * Every other-language name a product has (ADR-054), sent whole: a
 * language left out is removed, as a form with that field cleared means.
 * Empty removes them all. At most one per supported language.
 */
export class SetProductTranslationsDto {
  @IsArray()
  @ArrayMaxSize(SUPPORTED_LOCALES.length)
  @ArrayUnique(
    (translation?: ProductTranslationDto) => translation?.locale,
    ONE_PER_LANGUAGE,
  )
  @ValidateNested({ each: true })
  @Type(() => ProductTranslationDto)
  translations!: ProductTranslationDto[];
}

/** The same, for a variant. */
export class SetVariantTranslationsDto {
  @IsArray()
  @ArrayMaxSize(SUPPORTED_LOCALES.length)
  @ArrayUnique(
    (translation?: VariantTranslationDto) => translation?.locale,
    ONE_PER_LANGUAGE,
  )
  @ValidateNested({ each: true })
  @Type(() => VariantTranslationDto)
  translations!: VariantTranslationDto[];
}
