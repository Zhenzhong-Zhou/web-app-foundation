import { IsIn, IsOptional } from 'class-validator';

import { FILE_SIZES, type FileSize } from '../../../database/schema';

/**
 * `?size=`: which size of a photo or a square logo; a size the file does
 * not keep is answered with `full`, a logo's only one.
 */
export class ReadFileDto {
  @IsOptional()
  @IsIn(FILE_SIZES)
  size?: FileSize;
}
