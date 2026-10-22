import { ArrayMinSize, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateUserDto {
  /**
   * Roles only, every one the member is to hold, at least one (ADR-080).
   * Name and email are the user's own to change (see AccountController) —
   * an admin editing someone's personal details is a different feature
   * with different consent implications.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds!: string[];
}
