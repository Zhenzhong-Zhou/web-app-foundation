import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  // Name only. Changing an email is a flow, not a field: the new address has
  // to be verified before it takes effect, or a typo locks the account out.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
