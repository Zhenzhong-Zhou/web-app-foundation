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
import { useCallback, useEffect, useState } from 'react';

import { HistoryButton } from '../audit/history-button';
import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import type { TaxCode } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { TaxCodeDialog } from './tax-code-dialog';
import { describeCharges } from './tax-rate';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * The tax treatments an invoice line can carry (ADR-046).
 *
 * Reference data, set up once and changed when the law does, so it lives in
 * the account menu beside the organization's own details rather than in the
 * top nav. Everyone who drafts an invoice can see the codes; only the Owner
 * changes what a customer is charged.
 */
export function TaxCodesPage() {
  const { session } = useAuth();
  const [codes, setCodes] = useState<TaxCode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);

  const loading = codes === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const canCreate = !!session?.permissions.includes('tax_codes.create');
  const canUpdate = !!session?.permissions.includes('tax_codes.update');

  const load = useCallback(async () => {
    try {
      setCodes((await api<{ taxCodes: TaxCode[] }>('/tax-codes')).taxCodes);
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    void api<{ taxCodes: TaxCode[] }>('/tax-codes')
      .then((response) => {
        if (!ignore) setCodes(response.taxCodes);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Tax codes
        </Typography>

        {canCreate && (
          <Button onClick={openDialog(() => setCreating(true))}>
            Add tax code
          </Button>
        )}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Every invoice line carries one. A code can charge two taxes on the same
        amount, like GST and PST together; a code that charges nothing is
        Exempt. Changing a rate only affects invoices issued afterwards — issued
        ones keep the rate they were issued with.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? <Skeleton height={48} /> : null}
          </Stack>
        ) : codes?.length === 0 ? (
          <Alert severity="info">
            No tax codes yet. Invoices cannot be issued until each line has one
            — add the taxes you charge, and an Exempt code for items you do not
            tax.
          </Alert>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Charges</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right" aria-label="Actions" />
                </TableRow>
              </TableHead>

              <TableBody>
                {codes?.map((code) => (
                  <TableRow key={code.id}>
                    <TableCell>{code.name}</TableCell>
                    <TableCell>{describeCharges(code)}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={code.isActive ? 'In use' : 'Retired'}
                        color={code.isActive ? 'success' : 'default'}
                        variant={code.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      {/* "Who set PST to 8%, and when" is the question. */}
                      <HistoryButton resourceId={code.id} />

                      {canUpdate && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={openDialog(() => setEditing(code))}
                        >
                          Edit
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

      {/* Keyed, so each opening starts from its own values. */}
      <TaxCodeDialog
        key={creating ? 'new' : 'closed'}
        open={creating}
        taxCode={null}
        onClose={() => setCreating(false)}
        onSaved={load}
      />

      <TaxCodeDialog
        key={editing?.id}
        open={editing !== null}
        taxCode={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />
    </Stack>
  );
}
