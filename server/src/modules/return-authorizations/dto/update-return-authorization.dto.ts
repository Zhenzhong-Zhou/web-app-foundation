import { IsOptional, IsUUID } from 'class-validator';

/**
 * What changes on an RMA after it is raised: where its goods come back to
 * (ADR-071, amended). The lines, the reason and what happens to each item
 * are what was agreed with the customer, and stay as they were; a wrong one
 * is cancelled and raised again.
 */
export class UpdateReturnAuthorizationDto {
  /**
   * One of our sites; null for none, so the RMA prints the registered
   * address. Left out, unchanged.
   */
  @IsOptional()
  @IsUUID()
  sendBackToId?: string | null;
}
