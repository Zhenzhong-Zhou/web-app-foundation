import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { defineMessage, rule } from '../../../i18n/validation';

/** Trimmed, and empty is none: a cleared field is null, not "". */
const blankIsNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Your details at work (ADR-063), each optional; null clears one. Lengths
 * keep a card readable; the phone allows what phone numbers are written
 * with, and nothing else. The form holds the lengths but not the phone's
 * or the extension's characters, so those two refuse in words, naming
 * the field (#148).
 */
export class WorkDetailsDto {
  @IsOptional()
  @Transform(blankIsNull)
  @IsString()
  @MaxLength(100)
  jobTitle?: string | null;

  @IsOptional()
  @Transform(blankIsNull)
  @IsString()
  @MaxLength(100)
  department?: string | null;

  @IsOptional()
  @Transform(blankIsNull)
  @IsString()
  @MaxLength(100)
  location?: string | null;

  @IsOptional()
  @Transform(blankIsNull)
  @IsString()
  @MaxLength(40)
  @Matches(/^[0-9+().\-\s]+$/, {
    message: rule(
      defineMessage({
        id: 'validation.workPhone',
        defaultMessage:
          'Enter the work phone in digits, such as +1 604-555-0100, and put an extension in Extension.',
      }),
    ),
  })
  workPhone?: string | null;

  @IsOptional()
  @Transform(blankIsNull)
  @IsString()
  @MaxLength(10)
  @Matches(/^[0-9]+$/, {
    message: rule(
      defineMessage({
        id: 'validation.extension',
        defaultMessage: 'Enter the extension in digits only, such as 214.',
      }),
    ),
  })
  extension?: string | null;
}

/** A photo's size to read: the small circle or the large one. */
export class PhotoSizeDto {
  @IsOptional()
  @Matches(/^(thumb|full)$/)
  size?: 'thumb' | 'full';

  /** The photo's id, so a new photo is a new address; not read. */
  @IsOptional()
  @IsString()
  v?: string;
}
