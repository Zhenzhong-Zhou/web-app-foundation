import {
  Alert,
  Box,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Link as RouterLink,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { formatDate, formatDay } from '../lib/format';
import type { LotMatch, LotTrace } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * Finding a lot by the start of its code (ADR-044).
 *
 * A recall usually begins as a code read off a label, with no product
 * attached, so this searches every product. Links elsewhere in the app that
 * know only a code — shipments, returns — land here with ?code= filled in,
 * and a single exact match goes straight to its trace.
 */
export function LotSearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const code = params.get('code') ?? '';
  const [typed, setTyped] = useState(code);
  const [matches, setMatches] = useState<LotMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code.trim()) return;

    let ignore = false;

    void api<LotMatch[]>(
      `/stock/lots/search?${new URLSearchParams({ code }).toString()}`,
    )
      .then((rows) => {
        if (ignore) return;

        // Arriving from a link with an exact code: one answer, so no list.
        const exact = rows.filter(
          (row) => row.code.toLowerCase() === code.toLowerCase(),
        );
        if (exact.length === 1) {
          void navigate(`/lots/${exact[0].id}`, { replace: true });
          return;
        }

        setMatches(rows);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [code, navigate]);

  return (
    <Stack spacing={3}>
      <PageHeader crumbs={[]} title="Trace a lot" />

      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          setMatches(null);
          setParams(typed.trim() ? { code: typed.trim() } : {});
        }}
      >
        <TextField
          id="lot-code"
          label="Lot code"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          helperText="Any part of the code works — the batch number is usually enough. Press Enter to search."
          sx={{ maxWidth: 420 }}
          fullWidth
        />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {matches?.length === 0 && (
        <Typography color="text.secondary">
          No lot contains “{code}”.
        </Typography>
      )}

      {!!matches?.length && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Lot</TableCell>
                  <TableCell>SKU</TableCell>
                  <TableCell>Expires</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {matches.map((lot) => (
                  <TableRow key={lot.id} hover>
                    <TableCell>
                      <Link component={RouterLink} to={`/lots/${lot.id}`}>
                        {lot.code}
                      </Link>
                    </TableCell>
                    <TableCell>{lot.sku}</TableCell>
                    <TableCell>
                      {lot.expiresAt ? formatDay(lot.expiresAt) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}

/**
 * One lot's whole story (ADR-044): where it is, where it came from, what it
 * was made from and went into, and — the recall list — everyone who received
 * it or anything made from it.
 *
 * Every lot, run and order on the page links onward, so following a chain is
 * clicking rather than searching. Nothing here is editable: it is a reading of
 * the ledger, and correcting anything is done where the movement was made.
 */
export function LotTracePage() {
  const { id } = useParams<{ id: string }>();

  const [trace, setTrace] = useState<LotTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = trace === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let ignore = false;

    void api<LotTrace>(`/stock/lots/${id!}/trace`)
      .then((result) => {
        if (!ignore) setTrace(result);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!trace) return showSkeleton ? <Skeleton height={320} /> : null;

  const unknown = trace.recipients.filter((row) => !row.partnerName);

  return (
    <Stack spacing={4}>
      <PageHeader
        crumbs={[{ label: 'Trace a lot', to: '/lots' }]}
        title={`Lot ${trace.lot.code}`}
        subtitle={
          <>
            {trace.lot.sku} · {trace.lot.description}
            {trace.lot.expiresAt
              ? ` · expires ${formatDay(trace.lot.expiresAt)}`
              : ''}
          </>
        }
      />

      <Section title="Where it is now">
        {trace.balances.length === 0 ? (
          <Empty>None of this lot is on hand anywhere.</Empty>
        ) : (
          <Grid
            head={['Location', 'Quantity']}
            rows={trace.balances.map((row) => [
              <>
                {row.locationName}
                {!row.isAvailable && (
                  <Chip
                    label="Not available"
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1 }}
                  />
                )}
              </>,
              `${row.quantity} ${trace.lot.unitOfMeasure}`,
            ])}
            alignRight={[1]}
          />
        )}
      </Section>

      <Section title="Where it came from">
        {trace.sources.length === 0 ? (
          <Empty>
            No receipt or production is recorded for this lot. It may have been
            counted into stock by a correction.
          </Empty>
        ) : (
          <Stack spacing={1}>
            {trace.sources.map((source) => (
              <Typography
                key={`${source.kind}-${source.orderId ?? source.runId ?? ''}`}
              >
                {source.kind === 'production' ? (
                  <>
                    Made in run{' '}
                    <Link
                      component={RouterLink}
                      to={`/production/${source.runId!}`}
                    >
                      {source.runReference ?? 'without a reference'}
                    </Link>
                    {source.licenceNumber
                      ? ` under ${source.licenceNumber} (${source.licenceAuthority ?? ''})`
                      : ''}
                  </>
                ) : source.orderId ? (
                  <>
                    Received from {source.supplierName} on{' '}
                    <Link
                      component={RouterLink}
                      to={`/orders/${source.orderId}`}
                    >
                      {source.orderReference ?? 'an order'}
                    </Link>
                  </>
                ) : (
                  'Received with no order on record'
                )}
                {` — ${source.quantity} ${trace.lot.unitOfMeasure}, ${formatDate(source.at)}`}
              </Typography>
            ))}
          </Stack>
        )}
      </Section>

      <Section title="Made from">
        <RelatedTable
          rows={trace.madeFrom}
          empty="Not made in a run here — received, not produced."
        />
      </Section>

      <Section title="Went into">
        <RelatedTable rows={trace.wentInto} empty="Not used in any run." />
      </Section>

      <Section title="Who received it">
        <Typography variant="body2" color="text.secondary">
          This lot and everything made from it: the list a recall has to reach.
        </Typography>

        {unknown.length > 0 && (
          <Alert severity="warning">
            Some left with no recipient on record — shipped without an order, or
            sampled without a name. They are listed below with no partner.
          </Alert>
        )}

        {trace.recipients.length === 0 ? (
          <Empty>Nothing from this lot has left the business.</Empty>
        ) : (
          <Grid
            head={['Who', 'Order', 'Lot', 'Shipped', 'Sampled', 'Returned']}
            rows={trace.recipients.map((row) => [
              row.partnerId ? (
                <Link component={RouterLink} to={`/partners/${row.partnerId}`}>
                  {row.partnerName}
                </Link>
              ) : (
                <Typography component="span" color="text.secondary">
                  No recipient recorded
                </Typography>
              ),
              row.orderId ? (
                <Link component={RouterLink} to={`/orders/${row.orderId}`}>
                  {row.orderReference ?? 'Order'}
                  {row.isSampleOrder ? ' (sample)' : ''}
                </Link>
              ) : (
                '—'
              ),
              <Link component={RouterLink} to={`/lots/${row.lotId}`}>
                {row.lotCode}
              </Link>,
              row.shipped,
              row.sampled,
              row.returned,
            ])}
            alignRight={[3, 4, 5]}
          />
        )}
      </Section>
    </Stack>
  );
}

function RelatedTable({
  rows,
  empty,
}: {
  rows: LotTrace['madeFrom'];
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;

  return (
    <Grid
      head={['Lot', 'SKU', 'Steps away', 'Through run']}
      rows={rows.map((row) => [
        <Link component={RouterLink} to={`/lots/${row.lotId}`}>
          {row.code}
        </Link>,
        row.sku,
        String(row.depth),
        <Link component={RouterLink} to={`/production/${row.runId}`}>
          {row.runReference ?? 'Run'}
        </Link>,
      ])}
      alignRight={[2]}
    />
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2">
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary">
      {children}
    </Typography>
  );
}

/** A plain table: every section here is a short list of facts. */
function Grid({
  head,
  rows,
  alignRight = [],
}: {
  head: string[];
  rows: ReactNode[][];
  alignRight?: number[];
}) {
  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {head.map((label, index) => (
                <TableCell
                  key={label}
                  align={alignRight.includes(index) ? 'right' : 'left'}
                >
                  {label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((cells, rowIndex) => (
              <TableRow key={rowIndex}>
                {cells.map((cell, index) => (
                  <TableCell
                    key={index}
                    align={alignRight.includes(index) ? 'right' : 'left'}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
