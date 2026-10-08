import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { PartnersService } from './partners.service';

type PartnerRow = Awaited<ReturnType<PartnersService['exportRows']>>[number];

/** The partners export (ADR-057): a contact list with billing addresses. */
export const PARTNER_COLUMNS: ExportColumn<PartnerRow>[] = [
  { header: HEADERS.name, value: (row) => row.name },
  { header: HEADERS.code, value: (row) => row.code },
  {
    header: t({ id: 'exports.column.taxId', defaultMessage: 'Tax ID' }),
    value: (row) => row.taxId,
  },
  {
    header: t({
      id: 'exports.column.documentLanguage',
      defaultMessage: 'Document language',
    }),
    value: (row) => row.documentLanguage,
  },
  {
    header: t({ id: 'exports.column.retired', defaultMessage: 'Retired' }),
    value: (row) => row.retired,
  },
  {
    header: t({
      id: 'exports.column.billingAddress',
      defaultMessage: 'Billing address',
    }),
    value: (row) => row.billingAddress,
  },
];
