import type { ExportColumn } from '../../common/export';
import { t } from '../../i18n/translate';
import type { AuditRecord } from './audit.service';

/**
 * The audit log (ADR-057): who did what, when, to which record, with the
 * fields the entry recorded as JSON, since their shape differs per action.
 */
export const AUDIT_COLUMNS: ExportColumn<AuditRecord>[] = [
  {
    header: t({ id: 'exports.column.when', defaultMessage: 'When' }),
    value: (row) =>
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  },
  {
    header: t({ id: 'exports.column.by', defaultMessage: 'By' }),
    value: (row) => row.actorEmail,
  },
  {
    header: t({ id: 'exports.column.action', defaultMessage: 'Action' }),
    value: (row) => row.action,
  },
  {
    header: t({
      id: 'exports.column.resourceType',
      defaultMessage: 'Record type',
    }),
    value: (row) => row.resourceType,
  },
  {
    header: t({ id: 'exports.column.resource', defaultMessage: 'Record' }),
    value: (row) => row.resourceLabel ?? row.resourceId,
  },
  {
    header: t({ id: 'exports.column.details', defaultMessage: 'Details' }),
    value: (row) => (row.payload ? JSON.stringify(row.payload) : null),
  },
];
