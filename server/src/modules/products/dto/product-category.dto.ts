import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/** A category added (ADR-092): its name, and where in the tree. */
export class CreateProductCategoryDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /** The category it goes under; omitted or null at the top. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}

/** Renamed, moved, or both: null moves it to the top. */
export class UpdateProductCategoryDto {
  /** Left out to keep it; never null, which IsOptional would let through. */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string | null;
}
