import {
  Alert,
  Button,
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
} from '@mui/material';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { ExchangeRate, OrganizationProfile } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { PageHeader } from '../components/page-header';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { LearnMore } from '../help/learn-more';
import { api, isRevisionRefusal, messageFor } from '../lib/api';
import { formatDay, formatQuantity } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { ExchangeRateDialog } from './exchange-rate-dialog';

/**
 * 1.37000000 as 1.37. String work, not arithmetic (ADR-025): the column
 * always carries eight places, so only zeros after a point are dropped.
 */
/** Trailing zeros dropped on the string, then the reader's separator. */
function trimRate(rate: string): string {
  return formatQuantity(rate.includes('.') ? rate.replace(/\.?0+$/, '') : rate);
}

interface Loaded {
  rates: ExchangeRate[];
  baseCurrency: string | null;
}

async function fetchAll(): Promise<Loaded> {
  const [rates, organization] = await Promise.all([
    api<{ rates: ExchangeRate[] }>('/costs/exchange-rates'),
    api<{ organization: OrganizationProfile }>('/organization'),
  ]);

  return {
    rates: rates.rates,
    baseCurrency: organization.organization.baseCurrency,
  };
}

/**
 * One rate per currency per day, into the base currency (ADR-048).
 *
 * Reference data finance keeps, so it lives in the account menu beside tax
 * codes. A receipt priced in another currency is valued at the latest rate
 * on or before the day it arrived; with none on file it waits for a cost.
 */
export function ExchangeRatesPage() {
  const intl = useIntl();
  const can = useCan();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The failure itself, for a refusal for this tab's API revision (ADR-081).
  const [failure, setFailure] = useState<unknown>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExchangeRate | null>(null);

  const loading = loaded === null && error === null;
  const showSkeleton = useDelayedFlag(loading);
  const canUpdate = can('costs.update');

  const load = useCallback(async () => {
    try {
      setLoaded(await fetchAll());
      setError(null);
      setFailure(null);
    } catch (caught) {
      setError(messageFor(caught));
      setFailure(caught);
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    void fetchAll()
      .then((result) => {
        if (!ignore) setLoaded(result);
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setError(messageFor(caught));
        setFailure(caught);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const baseCurrency = loaded?.baseCurrency ?? null;

  if (isRevisionRefusal(failure) && !loaded) {
    return (
      <RevisionRefusalPage failure={failure} onRetry={() => void load()} />
    );
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.menu.exchangeRates',
          defaultMessage: 'Exchange rates',
        })}
        subtitle={
          <LearnMore
            target={{ guide: 'exchange-rates', section: 'add' }}
            variant="beside"
            after={intl.formatMessage({
              id: 'settings.rates.intro',
              defaultMessage:
                'What one unit of another currency is worth in your base currency, day by day. A purchase priced in that currency is valued at the latest rate on or before the day it arrived. Correcting a rate changes nothing already valued.',
            })}
          />
        }
        actions={
          <>
            {canUpdate && baseCurrency && (
              <Button onClick={openDialog(() => setCreating(true))}>
                {intl.formatMessage({
                  id: 'settings.rates.set',
                  defaultMessage: 'Set a rate',
                })}
              </Button>
            )}
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {loaded && !baseCurrency && (
        <Alert severity="info">
          <FormattedMessage
            id="settings.rates.noBase"
            defaultMessage="Set a base currency on the <link>Organization</link> page first — a rate converts into it."
            values={{
              link: (chunks: ReactNode[]) => (
                <Link
                  underline="always"
                  component={RouterLink}
                  to="/settings/organization?tab=money"
                >
                  {chunks}
                </Link>
              ),
            }}
          />
        </Alert>
      )}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : loaded?.rates.length === 0 ? (
          <EmptyState learnMore={{ guide: 'exchange-rates', section: 'add' }}>
            {intl.formatMessage({
              id: 'settings.rates.empty',
              defaultMessage: 'No rates yet.',
            })}
          </EmptyState>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'settings.rates.day',
                      defaultMessage: 'Day',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'components.currency.label',
                      defaultMessage: 'Currency',
                    })}
                  </TableCell>
                  <TableCell align="right">
                    {baseCurrency
                      ? intl.formatMessage(
                          {
                            id: 'settings.rates.rateIn',
                            defaultMessage: 'Rate (in {currency})',
                          },
                          { currency: baseCurrency },
                        )
                      : intl.formatMessage({
                          id: 'settings.rates.rate',
                          defaultMessage: 'Rate',
                        })}
                  </TableCell>
                  <TableCell
                    align="right"
                    aria-label={intl.formatMessage({
                      id: 'orders.lines.actions',
                      defaultMessage: 'Actions',
                    })}
                  />
                </TableRow>
              </TableHead>

              <TableBody>
                {loaded?.rates.map((rate) => (
                  <TableRow key={rate.id}>
                    <TableCell>{formatDay(rate.rateDate)}</TableCell>
                    <TableCell>{rate.currency}</TableCell>
                    <TableCell align="right">{trimRate(rate.rate)}</TableCell>
                    <TableCell align="right">
                      {canUpdate && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={openDialog(() => setEditing(rate))}
                        >
                          {intl.formatMessage({
                            id: 'settings.rates.correct',
                            defaultMessage: 'Correct',
                          })}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {baseCurrency && (
        <>
          <ExchangeRateDialog
            key={creating ? 'new' : 'closed'}
            open={creating}
            initial={null}
            baseCurrency={baseCurrency}
            onClose={() => setCreating(false)}
            onSaved={load}
          />

          <ExchangeRateDialog
            key={editing?.id}
            open={editing !== null}
            initial={editing && { ...editing, rate: trimRate(editing.rate) }}
            baseCurrency={baseCurrency}
            onClose={() => setEditing(null)}
            onSaved={load}
          />
        </>
      )}
    </Stack>
  );
}
