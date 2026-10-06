import {
  Alert,
  Button,
  Chip,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { formatDay, NO_VALUE } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { ProductLicence } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { EditLicenceDialog } from './edit-licence-dialog';
import { licenceStatus } from './licence-status';
import { NewLicenceDialog } from './new-licence-dialog';

/**
 * The registrations formulations are made and sold under — an NPN, a DIN, a
 * cosmetic notification number.
 *
 * Reference data, set up once and then chosen on a recipe, so it is reached
 * from Products rather than the top nav: a screen visited twice a year does
 * not earn a permanent tab.
 */
export function LicencesPage() {
  const intl = useIntl();
  const can = useCan();
  const {
    data: licences,
    error,
    loading,
    reload,
  } = useResource<ProductLicence[]>('/product-licences');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ProductLicence | null>(null);

  const showSkeleton = useDelayedFlag(loading);

  const canCreate = can('product_licences.create');
  const canUpdate = can('product_licences.update');

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {intl.formatMessage({
            id: 'products.licences',
            defaultMessage: 'Licences',
          })}
        </Typography>

        {canCreate && (
          <Button onClick={openDialog(() => setCreating(true))}>
            {intl.formatMessage({
              id: 'licences.add',
              defaultMessage: 'Add licence',
            })}
          </Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'licences.intro',
          defaultMessage:
            'Recipes are made under these. Withdrawn or expired ones stay listed rather than being deleted, so a batch made under one still traces back. Leave “Valid until” blank for a scheme that does not expire — an NPN does not.',
        })}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : licences?.length === 0 ? (
          <Alert severity="info">
            {intl.formatMessage({
              id: 'licences.empty',
              defaultMessage:
                'No licences yet. Add the number a formulation is registered under — for a natural health product in Canada, its NPN.',
            })}
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'invoices.number',
                      defaultMessage: 'Number',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'licences.issuedBy',
                      defaultMessage: 'Issued by',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'licences.issued',
                      defaultMessage: 'Issued',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'licences.validUntil',
                      defaultMessage: 'Valid until',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'common.status',
                      defaultMessage: 'Status',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'boms.notes',
                      defaultMessage: 'Notes',
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
                {licences?.map((licence) => (
                  <TableRow key={licence.id}>
                    <TableCell>{licence.number}</TableCell>
                    <TableCell>{licence.authority}</TableCell>
                    <TableCell>
                      {licence.issuedAt
                        ? formatDay(licence.issuedAt)
                        : NO_VALUE}
                    </TableCell>
                    <TableCell>
                      {licence.expiresAt
                        ? formatDay(licence.expiresAt)
                        : NO_VALUE}
                    </TableCell>
                    <TableCell>
                      {/* Derived, not stored: a date passes on its own, and a
                          flag needs somebody to remember. */}
                      <Chip
                        size="small"
                        label={licenceStatus(licence).label}
                        color={licenceStatus(licence).tone}
                        variant={
                          licenceStatus(licence).usable ? 'filled' : 'outlined'
                        }
                      />
                    </TableCell>
                    <TableCell>{licence.notes ?? NO_VALUE}</TableCell>
                    <TableCell align="right">
                      {/* A correction is the change people come looking for:
                          "who changed the number, and when". */}
                      <HistoryButton resourceId={licence.id} />

                      {canUpdate && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={openDialog(() => setEditing(licence))}
                        >
                          {intl.formatMessage({
                            id: 'common.edit',
                            defaultMessage: 'Edit',
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

      <NewLicenceDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reload}
      />

      {/* Keyed on the row, so opening a second licence starts from its own
          values rather than the previous one's (ADR: MUI Dialog state). */}
      <EditLicenceDialog
        key={editing?.id}
        licence={editing}
        onClose={() => setEditing(null)}
        onSaved={reload}
      />
    </Stack>
  );
}
