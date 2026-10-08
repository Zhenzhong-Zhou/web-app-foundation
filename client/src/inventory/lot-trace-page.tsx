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
import { FormattedMessage, useIntl } from 'react-intl';
import {
  Link as RouterLink,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { LotCostPanel } from '../costs/lot-cost-panel';
import { LoadFailure } from '../errors/load-failure';
import { api, messageFor } from '../lib/api';
import {
  formatDate,
  formatDay,
  formatQuantity,
  NO_VALUE,
  SEPARATOR,
} from '../lib/format';
import type { LotMatch, LotTrace } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { LicenceAtRelease } from '../licences/licence-at-release';
import { withUnit } from '../products/units';

/**
 * Finding a lot by the start of its code (ADR-044).
 *
 * A recall usually begins as a code read off a label, with no product
 * attached, so this searches every product. Links elsewhere in the app that
 * know only a code — shipments, returns — land here with ?code= filled in,
 * and a single exact match goes straight to its trace.
 */
export function LotSearchPage() {
  const intl = useIntl();
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
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'inventory.trace.title',
          defaultMessage: 'Trace a lot',
        })}
      />

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
          label={intl.formatMessage({
            id: 'inventory.trace.lotCode',
            defaultMessage: 'Lot code',
          })}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          helperText={intl.formatMessage({
            id: 'inventory.trace.lotCode.help',
            defaultMessage:
              'Any part of the code works — the batch number is usually enough. Press Enter to search.',
          })}
          sx={{ maxWidth: 420 }}
          fullWidth
        />
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {matches?.length === 0 && (
        <Typography color="text.secondary">
          {intl.formatMessage(
            {
              id: 'inventory.trace.noMatch',
              defaultMessage: 'No lot contains “{code}”.',
            },
            { code },
          )}
        </Typography>
      )}

      {!!matches?.length && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.lot',
                      defaultMessage: 'Lot',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'products.sku',
                      defaultMessage: 'SKU',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'inventory.lot.expires',
                      defaultMessage: 'Expires',
                    })}
                  </TableCell>
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
                      {lot.expiresAt ? formatDay(lot.expiresAt) : NO_VALUE}
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
  const intl = useIntl();
  const { id } = useParams<{ id: string }>();
  const can = useCan();

  const {
    data: trace,
    error,
    failure,
    loading,
    reload,
  } = useResource<LotTrace>(`/stock/lots/${id!}/trace`);

  const showSkeleton = useDelayedFlag(loading);

  if (error) {
    return (
      <LoadFailure
        failure={failure}
        message={error}
        missingTitle={intl.formatMessage({
          id: 'status.missing.lot',
          defaultMessage: "This lot doesn't exist",
        })}
        list={{
          to: '/lots',
          label: intl.formatMessage({
            id: 'layout.nav.trace',
            defaultMessage: 'Trace a lot',
          }),
        }}
        onRetry={() => void reload()}
      />
    );
  }
  if (!trace) return showSkeleton ? <Skeleton height={320} /> : null;

  const unknown = trace.recipients.filter((row) => !row.partnerName);
  // A recipient's order with no reference of its own.
  const orderWord = intl.formatMessage({
    id: 'inventory.trace.order',
    defaultMessage: 'Order',
  });

  return (
    <Stack spacing={4}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'inventory.trace.title',
              defaultMessage: 'Trace a lot',
            }),
            to: '/lots',
          },
        ]}
        title={intl.formatMessage(
          { id: 'inventory.lot.title', defaultMessage: 'Lot {code}' },
          { code: trace.lot.code },
        )}
        subtitle={[
          trace.lot.sku,
          trace.lot.description,
          trace.lot.expiresAt &&
            intl.formatMessage(
              {
                id: 'inventory.trace.expires',
                defaultMessage: 'expires {day}',
              },
              { day: formatDay(trace.lot.expiresAt) },
            ),
        ]
          .filter(Boolean)
          .join(SEPARATOR)}
      />

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.whereNow',
          defaultMessage: 'Where it is now',
        })}
      >
        {trace.balances.length === 0 ? (
          <Empty>
            {intl.formatMessage({
              id: 'inventory.trace.whereNow.empty',
              defaultMessage: 'None of this lot is on hand anywhere.',
            })}
          </Empty>
        ) : (
          <Grid
            head={[
              intl.formatMessage({
                id: 'inventory.location',
                defaultMessage: 'Location',
              }),
              intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              }),
            ]}
            rows={trace.balances.map((row) => [
              <>
                {row.locationName}
                {!row.isAvailable && (
                  <Chip
                    label={intl.formatMessage({
                      id: 'locations.notAvailable',
                      defaultMessage: 'Not available',
                    })}
                    size="small"
                    variant="outlined"
                    sx={{ ml: 1 }}
                  />
                )}
              </>,
              withUnit(row.quantity, trace.lot.unitOfMeasure, intl),
            ])}
            alignRight={[1]}
          />
        )}
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.cameFrom',
          defaultMessage: 'Where it came from',
        })}
      >
        {trace.sources.length === 0 ? (
          <Empty>
            {intl.formatMessage({
              id: 'inventory.trace.cameFrom.empty',
              defaultMessage:
                'No receipt or production is recorded for this lot. It may have been counted into stock by a correction.',
            })}
          </Empty>
        ) : (
          <Stack spacing={1}>
            {trace.sources.map((source) => (
              <Typography
                key={`${source.kind}-${source.orderId ?? source.runId ?? ''}`}
              >
                <FormattedMessage
                  id="inventory.trace.sourceLine"
                  defaultMessage="{source} — {amount}, {date}"
                  values={{
                    source: (
                      <SourceText
                        source={source}
                        linkToLicences={can('product_licences.view')}
                      />
                    ),
                    amount: withUnit(
                      source.quantity,
                      trace.lot.unitOfMeasure,
                      intl,
                    ),
                    date: formatDate(source.at),
                  }}
                />
              </Typography>
            ))}
          </Stack>
        )}
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.madeFrom',
          defaultMessage: 'Made from',
        })}
      >
        <RelatedTable
          rows={trace.madeFrom}
          empty={intl.formatMessage({
            id: 'inventory.trace.madeFrom.empty',
            defaultMessage: 'Not made in a run here — received, not produced.',
          })}
        />
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.wentInto',
          defaultMessage: 'Went into',
        })}
      >
        <RelatedTable
          rows={trace.wentInto}
          empty={intl.formatMessage({
            id: 'inventory.trace.wentInto.empty',
            defaultMessage: 'Not used in any run.',
          })}
        />
      </Section>

      <Section
        title={intl.formatMessage({
          id: 'inventory.trace.receivedBy',
          defaultMessage: 'Who received it',
        })}
      >
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'inventory.trace.receivedBy.intro',
            defaultMessage:
              'This lot and everything made from it: the list a recall has to reach.',
          })}
        </Typography>

        {unknown.length > 0 && (
          <Alert severity="warning">
            {intl.formatMessage({
              id: 'inventory.trace.unknownRecipients',
              defaultMessage:
                'Some left with no recipient on record — shipped without an order, or sampled without a name. They are listed below with no partner.',
            })}
          </Alert>
        )}

        {trace.recipients.length === 0 ? (
          <Empty>
            {intl.formatMessage({
              id: 'inventory.trace.receivedBy.empty',
              defaultMessage: 'Nothing from this lot has left the business.',
            })}
          </Empty>
        ) : (
          <Grid
            head={[
              intl.formatMessage({
                id: 'inventory.trace.who',
                defaultMessage: 'Who',
              }),
              intl.formatMessage({
                id: 'inventory.trace.order',
                defaultMessage: 'Order',
              }),
              intl.formatMessage({
                id: 'inventory.lot',
                defaultMessage: 'Lot',
              }),
              intl.formatMessage({
                id: 'inventory.trace.shipped',
                defaultMessage: 'Shipped',
              }),
              intl.formatMessage({
                id: 'inventory.trace.sampled',
                defaultMessage: 'Sampled',
              }),
              intl.formatMessage({
                id: 'inventory.trace.returned',
                defaultMessage: 'Returned',
              }),
            ]}
            rows={trace.recipients.map((row) => [
              row.partnerId ? (
                <Link component={RouterLink} to={`/partners/${row.partnerId}`}>
                  {row.partnerName}
                </Link>
              ) : (
                <Typography component="span" color="text.secondary">
                  {intl.formatMessage({
                    id: 'inventory.trace.noRecipient',
                    defaultMessage: 'No recipient recorded',
                  })}
                </Typography>
              ),
              row.orderId ? (
                <Link component={RouterLink} to={`/orders/${row.orderId}`}>
                  {row.isSampleOrder
                    ? intl.formatMessage(
                        {
                          id: 'inventory.trace.sampleOrder',
                          defaultMessage: '{reference} (sample)',
                        },
                        { reference: row.orderReference ?? orderWord },
                      )
                    : (row.orderReference ?? orderWord)}
                </Link>
              ) : (
                NO_VALUE
              ),
              <Link component={RouterLink} to={`/lots/${row.lotId}`}>
                {row.lotCode}
              </Link>,
              formatQuantity(row.shipped),
              formatQuantity(row.sampled),
              formatQuantity(row.returned),
            ])}
            alignRight={[3, 4, 5]}
          />
        )}
      </Section>

      {can('costs.view') && <LotCostPanel lotId={trace.lot.id} />}
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
  const intl = useIntl();

  if (rows.length === 0) return <Empty>{empty}</Empty>;

  return (
    <Grid
      head={[
        intl.formatMessage({ id: 'inventory.lot', defaultMessage: 'Lot' }),
        intl.formatMessage({ id: 'products.sku', defaultMessage: 'SKU' }),
        intl.formatMessage({
          id: 'inventory.trace.stepsAway',
          defaultMessage: 'Steps away',
        }),
        intl.formatMessage({
          id: 'inventory.trace.throughRun',
          defaultMessage: 'Through run',
        }),
      ]}
      rows={rows.map((row) => [
        <Link component={RouterLink} to={`/lots/${row.lotId}`}>
          {row.code}
        </Link>,
        row.sku,
        String(row.depth),
        <Link component={RouterLink} to={`/production/${row.runId}`}>
          {row.runReference ??
            intl.formatMessage({
              id: 'inventory.trace.run',
              defaultMessage: 'Run',
            })}
        </Link>,
      ])}
      alignRight={[2]}
    />
  );
}

/**
 * Where a lot came from, as one phrase the line above wraps with its
 * quantity and date: made in a run, perhaps under a licence; received on
 * an order; or received with neither. Each a whole sentence in the
 * catalogue, with its links as tags, so a language can put them where its
 * grammar needs them.
 */
function SourceText({
  source,
  linkToLicences,
}: {
  source: LotTrace['sources'][number];
  linkToLicences: boolean;
}) {
  const intl = useIntl();

  if (source.kind === 'production') {
    const reference =
      source.runReference ??
      intl.formatMessage({
        id: 'inventory.trace.noReference',
        defaultMessage: 'without a reference',
      });
    const run = (chunks: ReactNode[]) => (
      <Link
        underline="always"
        component={RouterLink}
        to={`/production/${source.runId!}`}
      >
        {chunks}
      </Link>
    );

    return source.licenceNumber ? (
      <FormattedMessage
        id="inventory.trace.madeInRunUnder"
        defaultMessage="Made in run <run>{reference}</run> under {licence}"
        values={{
          reference,
          run,
          licence: (
            <LicenceAtRelease run={source} linkToLicences={linkToLicences} />
          ),
        }}
      />
    ) : (
      <FormattedMessage
        id="inventory.trace.madeInRun"
        defaultMessage="Made in run <run>{reference}</run>"
        values={{ reference, run }}
      />
    );
  }

  if (source.orderId) {
    return (
      <FormattedMessage
        id="inventory.trace.receivedFrom"
        defaultMessage="Received from {supplier} on <order>{reference}</order>"
        values={{
          supplier: source.supplierName,
          reference:
            source.orderReference ??
            intl.formatMessage({
              id: 'inventory.trace.anOrder',
              defaultMessage: 'an order',
            }),
          order: (chunks: ReactNode[]) => (
            <Link
              underline="always"
              component={RouterLink}
              to={`/orders/${source.orderId}`}
            >
              {chunks}
            </Link>
          ),
        }}
      />
    );
  }

  return (
    <>
      {intl.formatMessage({
        id: 'inventory.trace.receivedNoOrder',
        defaultMessage: 'Received with no order on record',
      })}
    </>
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
