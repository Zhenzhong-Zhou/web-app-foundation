import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Trimmed, and empty is none: a cleared field is null, not "". */
const blankIsNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/**
 * Your details at work (ADR-063), each optional; null clears one. Lengths
 * keep a card readable; the phone allows what phone numbers are written
 * with, and nothing else.
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
  @Matches(/^[0-9+().\-\s]+$/)
  workPhone?: string | null;

  @IsOptional()
  @Transform(blankIsNull)
  @IsString()
  @MaxLength(10)
  @Matches(/^[0-9]+$/)
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
