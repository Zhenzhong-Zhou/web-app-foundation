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
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { NO_VALUE } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { Partner } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { CreatePartnerDialog } from './create-partner-dialog';
import { EditPartnerDialog } from './edit-partner-dialog';

/**
 * The directory of everyone the organization trades with (ADR-026).
 *
 * One list, no customer/supplier split: the same firm is often both, and what
 * a partner *is* follows from what has been traded with them — a join over
 * orders, which belongs to that screen rather than this one.
 *
 * Retired partners are listed here rather than hidden. This is a directory,
 * and a name that vanished is harder to explain than one shown as inactive.
 * The order form is where the filter belongs, because that is the one place an
 * inactive partner would be a mistake.
 */
export function PartnersPage() {
  const intl = useIntl();
  const can = useCan();

  const {
    data: items,
    error,
    loading,
    reload,
  } = useResource<Partner[]>('/partners');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);

  const canCreate = can('partners.create');
  const canEdit = can('partners.update');
  const showSkeleton = useDelayedFlag(loading);
  // From the address too: the lookup's "Show all" opens it narrowed.
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [retiredOnly, setRetiredOnly] = useState(false);

  /**
   * Narrowed here, as on Products: the list arrives whole. The search
   * reaches the name, the code and the tax ID, the three things a person
   * is likely to have in hand. Retired partners stay listed by default.
   */
  const retired = (items ?? []).filter((partner) => !partner.isActive).length;
  const shown = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return (items ?? []).filter(
      (partner) =>
        (!retiredOnly || !partner.isActive) &&
        (!needle ||
          [partner.name, partner.code, partner.taxId].some((field) =>
            field?.toLocaleLowerCase().includes(needle),
          )),
    );
  }, [items, search, retiredOnly]);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.partners',
          defaultMessage: 'Partners',
        })}
        actions={
          <Stack direction="row" spacing={1}>
            <Button
              variant="text"
              disabled={loading}
              onClick={() => void reload()}
            >
              {intl.formatMessage({
                id: 'common.refresh',
                defaultMessage: 'Refresh',
              })}
            </Button>
            {canCreate && (
              <Button onClick={openDialog(() => setCreating(true))}>
                {intl.formatMessage({
                  id: 'partners.add',
                  defaultMessage: 'Add partner',
                })}
              </Button>
            )}
          </Stack>
        }
      />

      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: search,
          onChange: setSearch,
        }}
        quick={[
          {
            id: 'retired',
            label: intl.formatMessage({
              id: 'common.retired',
              defaultMessage: 'Retired',
            }),
            count: retired,
            pressed: retiredOnly,
            onToggle: () => setRetiredOnly((on) => !on),
          },
        ]}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : shown.length ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.name',
                      defaultMessage: 'Name',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'partners.code',
                      defaultMessage: 'Code',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'partners.taxId',
                      defaultMessage: 'Tax ID',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.status',
                      defaultMessage: 'Status',
                    })}
                  </TableCell>
                  {/* The column exists only when it can hold anything. An empty
                    actions column is a promise the screen cannot keep. */}
                  {canEdit && (
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'common.edit',
                        defaultMessage: 'Edit',
                      })}
                    </TableCell>
                  )}
                </TableRow>
              </TableHead>

              <TableBody>
                {shown.map((partner) => (
                  <TableRow key={partner.id} hover>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/partners/${partner.id}`}
                      >
                        {partner.name}
                      </Link>
                    </TableCell>

                    {/* An em dash rather than an empty cell: blank reads as a
                      rendering fault, and every one of these is optional. */}
                    <TableCell>{partner.code ?? NO_VALUE}</TableCell>
                    <TableCell>{partner.taxId ?? NO_VALUE}</TableCell>

                    <TableCell>
                      {partner.isActive ? (
                        intl.formatMessage({
                          id: 'common.active',
                          defaultMessage: 'Active',
                        })
                      ) : (
                        // Retired rather than deleted: a partner referenced by
                        // an order cannot be removed without inventing gaps in
                        // the history the order exists to record.
                        <StatusChip
                          tone="neutral"
                          label={intl.formatMessage({
                            id: 'common.retired',
                            defaultMessage: 'Retired',
                          })}
                        />
                      )}
                    </TableCell>

                    {canEdit && (
                      <TableCell align="right">
                        <Button
                          variant="text"
                          size="small"
                          onClick={openDialog(() => setEditing(partner))}
                        >
                          {intl.formatMessage({
                            id: 'common.edit',
                            defaultMessage: 'Edit',
                          })}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <EmptyState>
            {items?.length
              ? intl.formatMessage({
                  id: 'inventory.noMatch',
                  defaultMessage: 'Nothing matches that search.',
                })
              : intl.formatMessage({
                  id: 'partners.empty',
                  defaultMessage:
                    'No partners yet. Add the firms you buy from and sell to — an order needs one before it can be raised. The same partner can be both.',
                })}
          </EmptyState>
        )}
      </Paper>

      <CreatePartnerDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reload}
      />

      {/**
       * Keyed here rather than on the Dialog inside: a key remounts the
       * component it is written on, and the state lives in this one. On the
       * inner Dialog it rebuilt MUI's element while useState kept its first
       * value — seeded from a null partner, so the form opened empty.
       */}
      <EditPartnerDialog
        key={editing?.id}
        partner={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </Stack>
  );
}
