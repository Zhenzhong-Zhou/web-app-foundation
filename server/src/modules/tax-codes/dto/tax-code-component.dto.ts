import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/** One tax a code charges (ADR-046). */
export class TaxCodeComponentDto {
  /** What the invoice's tax line says: "GST", "PST". */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  /**
   * A percentage, sent as a string: "5" is 5%. At most three digits before
   * the point, because the column is numeric(7, 4) and a fourth would be an
   * overflow (a 500) rather than a refusal. The bound of 100 itself is the
   * database's check, reported as a 400 by the service.
   */
  @IsString()
  @Matches(/^\d{1,3}(\.\d{1,4})?$/, {
    message:
      'rate must be a percentage with at most 4 decimal places, sent as a string',
  })
  rate!: string;
}
