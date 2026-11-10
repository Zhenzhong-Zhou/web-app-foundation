import { ItemFiltersDto } from './list-products.dto';

/**
 * The catalogue's export takes the list's own query, without its page
 * (ADR-057, ADR-092): its type, its category, Discontinued, its search
 * and its sort.
 */
export class ExportProductsDto extends ItemFiltersDto {}
