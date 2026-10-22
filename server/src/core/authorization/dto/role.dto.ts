import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDate,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { ALL_PERMISSIONS, type Permission } from '../permissions';

/** A made role's name and line run to these (ADR-080). */
export const ROLE_NAME_MAX_LENGTH = 50;
export const ROLE_DESCRIPTION_MAX_LENGTH = 200;

/**
 * A role made (ADR-080): its name, as its maker writes it in any language
 * and never translated; what it is for, optionally; and everything it
 * grants. The three every role holds are added if left out.
 */
export class CreateRoleDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  name!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(ROLE_DESCRIPTION_MAX_LENGTH)
  description?: string | null;

  @IsArray()
  @ArrayUnique()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions!: Permission[];
}

/**
 * A role saved from the editor: the whole of it, as made, and when it was
 * saved last as the editor read it, so a save made after someone else's
 * is refused rather than overwriting theirs (ADR-080).
 */
export class UpdateRoleDto extends CreateRoleDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  updatedAt!: Date;
}

/** Move everyone: the role they move to. */
export class MoveRoleDto {
  @IsUUID()
  toRoleId!: string;
}
