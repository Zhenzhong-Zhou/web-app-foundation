import { Link } from '@mui/material';
import { Fragment } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { AuditRecord } from '../api/types.gen';
import { type Permission, useCan } from '../auth/permissions';
import type { AuditLinkKind } from '../lib/api-names';
import { formatDay, formatWhen, NO_VALUE, SEPARATOR } from '../lib/format';
import { RECENT_PATHS } from '../lib/recent';

type Detail = AuditRecord['details'][number];

/** Punctuation between a field and its value, and across a change. */
const COLON = ': ';
const ARROW = ' → ';
type Value = NonNullable<Detail['value']>;

/** A page a reference opens, and the permission that opens it. */
interface Page {
  path: (id: string) => string;
  may: Permission;
}

/**
 * Where each kind of reference links, and who may follow it: a kind with
 * no page (null), or a reader without the permission to open it, gets the
 * name as plain text (ADR-076). The id is only ever in the URL. Every kind
 * is listed, so one the server adds is a decision here, not text by
 * default.
 */
const PAGES: Record<AuditLinkKind, Page | null> = {
  order: { path: RECENT_PATHS.order, may: 'orders.view' },
  invoice: { path: RECENT_PATHS.invoice, may: 'invoices.view' },
  partner: { path: RECENT_PATHS.partner, may: 'partners.view' },
  product: { path: RECENT_PATHS.product, may: 'products.view' },
  lot: { path: RECENT_PATHS.lot, may: 'stock.view' },
  price_list: { path: RECENT_PATHS.priceList, may: 'price_lists.view' },
  // Its page (ADR-080), which every member may read.
  role: { path: (id) => `/settings/roles/${id}`, may: 'roles.view' },
  location: null,
  tax_code: null,
  variant: null,
  order_line: null,
  order_return: null,
};

/**
 * An entry's details as the server worded them (ADR-076): "Due date: 18 Nov
 * 2026", "Role: Viewer → Admin". The words are the server's, in the
 * reader's language; a day and a moment are formatted here, in the
 * reader's format and zone, and a reference is a link when the reader may
 * open it. Nothing here makes a word from a key.
 */
export function AuditDetails({ details }: { details: Detail[] }) {
  const can = useCan();

  if (details.length === 0) return null;

  function show(value: Value | null) {
    if (!value) return NO_VALUE;
    const text = value.at
      ? formatWhen(value.at)
      : value.day
        ? formatDay(value.day)
        : value.text;
    const page = value.link ? PAGES[value.link.kind] : null;
    if (!value.link || !page || !can(page.may)) return text;
    // Underlined, as every link inside a line of text is: colour alone
    // does not tell it from the words around it (WCAG 1.4.1).
    return (
      <Link
        component={RouterLink}
        to={page.path(value.link.id)}
        underline="always"
      >
        {text}
      </Link>
    );
  }

  return (
    <>
      {details.map((detail, index) => (
        <Fragment key={`${detail.field}-${index}`}>
          {index > 0 && SEPARATOR}
          {detail.field}
          {detail.changed ? (
            <>
              {COLON}
              {show(detail.from)}
              {ARROW}
              {show(detail.value)}
            </>
          ) : (
            detail.value && (
              <>
                {COLON}
                {show(detail.value)}
              </>
            )
          )}
        </Fragment>
      ))}
    </>
  );
}
