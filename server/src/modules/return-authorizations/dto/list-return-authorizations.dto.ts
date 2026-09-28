import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import {
  RETURN_AUTHORIZATION_STATUSES,
  type ReturnAuthorizationStatus,
} from '../../../database/schema';

/** The keyset shape of ListInvoicesDto, for the same reasons. */
export class ListReturnAuthorizationsDto {
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Absent means every status; the customer-service list asks for open. */
  @IsOptional()
  @IsIn(RETURN_AUTHORIZATION_STATUSES)
  status?: ReturnAuthorizationStatus;

  /** An order's RMAs, for its page. */
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
