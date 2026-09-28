import { IsOptional, IsString, Matches } from 'class-validator';

export class ListExchangeRatesDto {
  /** One currency's history, the question asked when a rate looks wrong. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string;
}
