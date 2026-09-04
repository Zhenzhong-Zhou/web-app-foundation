import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * `type` is absent. Reclassifying a shelf as a warehouse after stock has moved
 * through it would silently reinterpret every movement that referenced it, and
 * the type is a label anyway — leaf-ness is computed from children, not
 * declared (ADR-024).
 */
export class UpdateLocationDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  code?: string;

  /** Reparenting. Null moves the location to the top level. */
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  /** False for Quarantine, Returns, and WIP — see ADR-024. */
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
