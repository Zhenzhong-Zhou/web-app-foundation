import { Box, Button, Link } from '@mui/material';
import { Fragment, useId, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { AuditRecord } from '../api/types.gen';
import { type Permission, useCan } from '../auth/permissions';
import { ReferencesWhole } from '../components/reference';
import type { AuditLinkKind } from '../lib/api-names';
import { formatDay, formatWhen, NO_VALUE, SEPARATOR } from '../lib/format';
import { RECENT_PATHS } from '../lib/recent';

type Detail = AuditRecord['details'][number];

/**
 * Punctuation between a field and its value, and across a change: the
 * space before the arrow is where a change may break, the arrow staying
 * with the new value.
 */
const COLON = ': ';
const ARROW = '→ ';
type Value = NonNullable<Detail['value']>;

/**
 * Up to six changes show whole; from seven, the first five and a button
 * for the rest (ADR-076, amended).
 */
const WHOLE_UP_TO = 6;
const FOLDED_TO = 5;

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
  // Settings › Categories lists them all, with no page for one.
  product_category: null,
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
 *
 * One change or none reads on one line, joined by dots. Two or more take
 * a line each, a list a screen reader counts, after the details that are
 * not changes; from seven, the first five and "Show all {count}
 * changes", which opens the rest in place and stays where focus is. The
 * arrow and the new value move to the next line whole by layout alone;
 * nothing is cut, and nothing shows on hover alone (ADR-076, amended for
 * ADR-094's R23). The Activity log's page and a record's History both
 * draw it.
 */
export function AuditDetails({ details }: { details: Detail[] }) {
  const intl = useIntl();
  const can = useCan();
  const listId = useId();
  const [whole, setWhole] = useState(false);

  if (details.length === 0) return null;

  function show(value: Value | null) {
    if (!value) return NO_VALUE;
    // The server's words, its references kept whole by their hyphens
    // (ADR-081).
    const text = (
      <ReferencesWhole
        text={
          value.at
            ? formatWhen(value.at)
            : value.day
              ? formatDay(value.day)
              : value.text
        }
      />
    );
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

  /** A detail: its field, then its value, or before → after. */
  function said(detail: Detail) {
    return (
      <>
        {detail.field}
        {detail.changed ? (
          <>
            {COLON}
            {show(detail.from)}{' '}
            {/* One box, so where it does not fit beside the old value it
                moves to the next line whole; a value longer than the line
                still wraps inside it. */}
            <Box component="span" sx={{ display: 'inline-block' }}>
              {ARROW}
              {show(detail.value)}
            </Box>
          </>
        ) : (
          detail.value && (
            <>
              {COLON}
              {show(detail.value)}
            </>
          )
        )}
      </>
    );
  }

  /** Details on one line, joined by dots. */
  function oneLine(shown: { detail: Detail; index: number }[]) {
    return shown.map(({ detail, index }, at) => (
      <Fragment key={`${detail.field}-${index}`}>
        {at > 0 && SEPARATOR}
        {said(detail)}
      </Fragment>
    ));
  }

  const indexed = details.map((detail, index) => ({ detail, index }));
  const changes = indexed.filter(({ detail }) => detail.changed);
  if (changes.length < 2) return oneLine(indexed);

  const others = indexed.filter(({ detail }) => !detail.changed);
  const folds = changes.length > WHOLE_UP_TO;
  const shown = folds && !whole ? changes.slice(0, FOLDED_TO) : changes;

  return (
    <>
      {others.length > 0 && <div>{oneLine(others)}</div>}
      {/* role="list": Safari leaves a list unannounced once its bullets
          are off, and the count is what a screen reader says first. */}
      <Box
        component="ul"
        role="list"
        id={listId}
        sx={{ listStyle: 'none', m: 0, p: 0 }}
      >
        {shown.map(({ detail, index }) => (
          <li key={`${detail.field}-${index}`}>{said(detail)}</li>
        ))}
      </Box>
      {/* The same button open and shut, after the lines, so focus stays
          on it as the rest open above it. */}
      {folds && (
        <Button
          variant="outlined"
          size="small"
          aria-expanded={whole}
          aria-controls={listId}
          onClick={() => setWhole(!whole)}
          sx={{ mt: 0.5 }}
        >
          {whole
            ? intl.formatMessage({
                id: 'audit.changes.fewer',
                defaultMessage: 'Show fewer',
              })
            : intl.formatMessage(
                {
                  id: 'audit.changes.all',
                  // Seven or more, never one.
                  defaultMessage: '{count, plural, other {Show all # changes}}',
                },
                { count: changes.length },
              )}
        </Button>
      )}
    </>
  );
}
