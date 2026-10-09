import { IsIn, IsOptional } from 'class-validator';

import { FILE_SIZES, type FileSize } from '../../../database/schema';

/** `?size=`: which size of a photo; a logo has only `full`. */
export class ReadFileDto {
  @IsOptional()
  @IsIn(FILE_SIZES)
  size?: FileSize;
}
