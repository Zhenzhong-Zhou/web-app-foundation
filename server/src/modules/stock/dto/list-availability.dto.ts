import { IsBooleanString, IsOptional } from 'class-validator';

export class ListAvailabilityDto {
  /** Only products with open demand: what something is promised from. */
  @IsOptional()
  @IsBooleanString()
  promised?: string;
}
