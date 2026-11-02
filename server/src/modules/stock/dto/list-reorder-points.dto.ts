import { IsIn, IsOptional } from 'class-validator';

import { SearchableKeysetQueryDto } from '../../../common/dto/searchable-keyset-query.dto';

/**
 * The reorder points list's filter, search and page (ADR-085): every item
 * with a point unless asked for the low, the out among them, or the out
 * alone.
 */
export class ListReorderPointsDto extends SearchableKeysetQueryDto {
  @IsOptional()
  @IsIn(['low', 'out'])
  status?: 'low' | 'out';
}
