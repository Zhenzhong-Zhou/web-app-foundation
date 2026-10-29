import { IsBooleanString, IsOptional } from 'class-validator';

import { SearchQueryDto } from '../../../common/dto/search-query.dto';

/**
 * The catalogue's export takes what its list shows (ADR-057): the list's
 * search, and its Discontinued quick filter, which the list itself applies
 * to the whole answer in the browser.
 */
export class ExportProductsDto extends SearchQueryDto {
  /** Only the discontinued products, as the list's Discontinued shows them. */
  @IsOptional()
  @IsBooleanString()
  discontinued?: string;
}
