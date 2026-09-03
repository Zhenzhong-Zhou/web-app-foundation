import { IsUUID } from 'class-validator';

export class UpdateUserDto {
  /**
   * Role only. Name and email are the user's own to change (see
   * AccountController) — an admin editing someone's personal details is a
   * different feature with different consent implications.
   */
  @IsUUID()
  roleId!: string;
}
