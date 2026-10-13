import { ApiProperty } from '@nestjs/swagger';

import { ERROR_CODES, type ErrorCode } from '../common/error-codes';
import { type Locale, SUPPORTED_LOCALES } from '../common/locales';
import {
  ALL_AUDIT_ACTIONS,
  type AuditAction,
} from '../core/audit/audit-actions';
import {
  ALL_PERMISSIONS,
  type Permission,
} from '../core/authorization/permissions';

/**
 * The lists the client shares with the server, each a named enum in the
 * OpenAPI document (ADR-068): Permission, Locale, AuditAction and ErrorCode.
 * The client's types are generated from them, in place of the copies each
 * side kept. A schema only: nothing returns this class, and the response
 * classes of phase 2 refer to the same enums by name.
 */
export class ApiVocabulary {
  @ApiProperty({ enum: ALL_PERMISSIONS, enumName: 'Permission' })
  permission!: Permission;

  @ApiProperty({ enum: [...SUPPORTED_LOCALES], enumName: 'Locale' })
  locale!: Locale;

  @ApiProperty({ enum: ALL_AUDIT_ACTIONS, enumName: 'AuditAction' })
  auditAction!: AuditAction;

  @ApiProperty({ enum: Object.values(ERROR_CODES), enumName: 'ErrorCode' })
  errorCode!: ErrorCode;
}
