import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { LOCATION_TYPES, type LocationType } from '../../../database/schema';

export class CreateLocationDto {
  @IsIn(LOCATION_TYPES)
  type!: LocationType;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /** What is printed on the label — "H5", "A-01-03". Typed, not generated. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  code?: string;

  /** Omitted for a top-level location; a warehouse has no parent. */
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
