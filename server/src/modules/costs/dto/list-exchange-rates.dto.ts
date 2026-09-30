import { IsOptional, IsString } from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';

export class ListExchangeRatesDto {
  /** One currency's history, the question asked when a rate looks wrong. */
  @IsOptional()
  @IsString()
  @IsCurrencyCode()
  currency?: string;
}
