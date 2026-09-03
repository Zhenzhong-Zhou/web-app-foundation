import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * Product-level fields only. Type is absent deliberately: changing a good into
 * equipment after it has moved would silently reinterpret every historical
 * movement, and there is no correct answer for what the old rows then mean.
 */
export class UpdateProductDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Discontinuing. Never cascaded to variants — see the service. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
