import { IsBooleanString, IsOptional } from 'class-validator';

import { SearchQueryDto } from '../../../common/dto/search-query.dto';

/**
 * The directory's export takes what its list shows (ADR-057): the list's
 * search, and its Retired quick filter, which the list itself applies to
 * the whole answer in the browser.
 */
export class ExportPartnersDto extends SearchQueryDto {
  /** Only the retired partners, as the list's Retired shows them. */
  @IsOptional()
  @IsBooleanString()
  retired?: string;
}
