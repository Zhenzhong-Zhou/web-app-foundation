import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { KeysetQueryDto } from '../../../common/dto/keyset-query.dto';
import {
  RETURN_AUTHORIZATION_STATUSES,
  type ReturnAuthorizationStatus,
} from '../../../database/schema';

/** Paged like every list, by KeysetQueryDto; these are the RMA filters. */
export class ListReturnAuthorizationsDto extends KeysetQueryDto {
  /** Absent means every status; the customer-service list asks for open. */
  @IsOptional()
  @IsIn(RETURN_AUTHORIZATION_STATUSES)
  status?: ReturnAuthorizationStatus;

  /** An order's RMAs, for its page. */
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
