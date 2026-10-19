import { csvMoment } from '../../common/csv';
import type { ExportColumn } from '../../common/export';
import { t } from '../../i18n/translate';
import type { AuditRecord } from './audit.service';
import type { AuditDetail } from './dto/audit-response.dto';

/**
 * The audit log (ADR-057), in the same words as the screens (ADR-076): the
 * action and the kind of record named, the record by its label, the person
 * by name and email, and what was recorded as one line, with no ids, keys
 * or JSON. The list was worded in the reader's language when it was read.
 */
export const AUDIT_COLUMNS: ExportColumn<AuditRecord>[] = [
  {
    header: t({ id: 'exports.column.when', defaultMessage: 'When' }),
    value: (row) => csvMoment(row.createdAt),
  },
  {
    header: t({ id: 'exports.column.by', defaultMessage: 'By' }),
    value: (row) => row.actorName,
  },
  {
    header: t({ id: 'exports.column.email', defaultMessage: 'Email' }),
    value: (row) => row.actorEmail,
  },
  {
    header: t({ id: 'exports.column.action', defaultMessage: 'Action' }),
    value: (row) => row.actionName,
  },
  {
    header: t({
      id: 'exports.column.resourceType',
      defaultMessage: 'Record type',
    }),
    value: (row) => row.resourceTypeName,
  },
  {
    header: t({ id: 'exports.column.resource', defaultMessage: 'Record' }),
    value: (row) => row.resourceLabel,
  },
  {
    header: t({ id: 'exports.column.details', defaultMessage: 'Details' }),
    value: (row) => detailsLine(row.details),
  },
];

/**
 * The details on one line: "Due date: 2026-11-18 → 2026-12-18 · …". A
 * moment is written as the When column writes one.
 */
function detailsLine(details: AuditDetail[]): string | null {
  const text = (value: AuditDetail['value']) =>
    value?.at ? csvMoment(value.at) : (value?.text ?? '—');
  const parts = details.map((detail) =>
    detail.changed
      ? `${detail.field}: ${text(detail.from)} → ${text(detail.value)}`
      : detail.value
        ? `${detail.field}: ${text(detail.value)}`
        : detail.field,
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}
