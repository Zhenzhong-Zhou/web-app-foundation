import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ERROR_CODES, type ErrorCode } from '../common/error-codes';

/**
 * What a few codes carry beside the code, for the screen to act on: which
 * series a numbering refusal is about, and the least next number it would
 * accept (ADR-073); the invitation to resend, when the next link can be
 * made, and the day an account is to be deleted (ADR-077).
 */
export class ErrorDetails {
  @ApiPropertyOptional({ type: [String] })
  series?: string[];

  @ApiPropertyOptional()
  lowest?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  invitationId?: string;

  /** A moment, for the screen to show in its reader's time. */
  @ApiPropertyOptional({ format: 'date-time' })
  at?: string;

  /** A calendar day, YYYY-MM-DD (ADR-052). */
  @ApiPropertyOptional({ format: 'date' })
  day?: string;
}

/**
 * Every refusal's body, as AllExceptionsFilter writes it. Declared for the
 * OpenAPI document only (ADR-068): the filter builds the body itself.
 */
export class ErrorBody {
  @ApiProperty()
  statusCode!: number;

  /** The status's name, such as CONFLICT. */
  @ApiProperty()
  error!: string;

  /** A sentence in the reader's language, or one per invalid field. */
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
  })
  message!: string | string[];

  /** What a screen can act on, when the refusal has a way out. */
  @ApiPropertyOptional({
    enum: Object.values(ERROR_CODES),
    enumName: 'ErrorCode',
  })
  code?: ErrorCode;

  /** Beside a few codes only (error-codes.ts). */
  @ApiPropertyOptional({ type: () => ErrorDetails })
  details?: ErrorDetails;

  @ApiProperty()
  path!: string;

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  /** What ties a person's report to a log line. */
  @ApiPropertyOptional()
  requestId?: string;
}
