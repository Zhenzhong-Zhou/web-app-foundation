import {
  Alert,
  Button,
  Chip,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { HistoryLink } from '../components/history-link';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { openDialog } from '../lib/open-dialog';
import type { LineVariance, RunDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import {
  CancelRunDialog,
  CloseRunDialog,
  RecordOutputDialog,
  ReleaseRunDialog,
} from './run-dialogs';
import { STATUS_COLOUR, STATUS_LABEL } from './status';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function ProductionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [run, setRun] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [variances, setVariances] = useState<LineVariance[]>([]);

  const [releasing, setReleasing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const canRelease = !!session?.permissions.includes('production.release');
  const canComplete = !!session?.permissions.includes('production.complete');

  const loading = run === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    setRun(await api<RunDetail>(`/production-orders/${id!}`));
    setError(null);
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void api<RunDetail>(`/production-orders/${id!}`)
      .then((row) => {
        if (!ignore) setRun(row);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Stack spacing={2}>
        {showSkeleton ? <Skeleton height={200} /> : null}
      </Stack>
    );
  }

  if (error && !run) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{error}</Alert>
        <Link component={RouterLink} to="/production">
          Back to production
        </Link>
      </Stack>
    );
  }

  if (!run) return null;

  const isDraft = run.status === 'draft';
  const isReleased = run.status === 'released';

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[{ label: 'Production', to: '/production' }]}
        title={`${run.quantityPlanned} planned`}
        status={{
          label: STATUS_LABEL[run.status],
          color: STATUS_COLOUR[run.status],
        }}
        actions={
          <Stack direction="row" spacing={1}>
            <HistoryLink resourceId={run.id} />
            {canRelease && isDraft && (
              <Tooltip title="Copies the recipe onto this run and moves components to it">
                <span>
                  <Button onClick={openDialog(() => setReleasing(true))}>
                    Release
                  </Button>
                </span>
              </Tooltip>
            )}

            {canComplete && isReleased && (
              <Button onClick={openDialog(() => setRecording(true))}>
                Record output
              </Button>
            )}

            {canComplete && isReleased && (
              <Button onClick={openDialog(() => setClosing(true))}>
                Close run
              </Button>
            )}

            {canRelease && (isDraft || isReleased) && (
              <Button
                variant="text"
                color="error"
                onClick={openDialog(() => setCancelling(true))}
              >
                Cancel
              </Button>
            )}
          </Stack>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {/* Shown once, after closing, and not persisted anywhere on this page:
          the figure lives in the audit entry, and the moment of closing is
          when somebody can act on it (ADR-032). */}
      {variances.length > 0 && (
        <Alert severity="warning">
          {variances.length === 1
            ? 'One component was well off plan: '
            : `${variances.length} components were well off plan: `}
          {/* variance.sku rather than a lookup in run.lines: the server has
              snapshotted it, and the lookup would fail for a line that is no
              longer on the run. */}
          {variances
            .map(
              (variance) =>
                `${variance.sku} at ${Math.round(variance.variance * 100)}%`,
            )
            .join(', ')}
          . Recorded as it happened — worth a look at the recipe or the batch.
        </Alert>
      )}

      {run.status === 'completed' && (
        <Alert severity="success">
          Finished. {run.quantityProduced} produced against a plan of{' '}
          {run.quantityPlanned}.
        </Alert>
      )}

      {run.status === 'cancelled' && run.notes && (
        <Alert severity="info">{run.notes}</Alert>
      )}

      <Stack direction="row" spacing={4}>
        <Detail label="Produced so far" value={run.quantityProduced} />
        <Detail
          label="Made by"
          value={run.partnerId ? 'Contract manufacturer' : 'In house'}
        />
        <Detail
          label="Batches"
          value={run.outputLots.length ? String(run.outputLots.length) : '—'}
        />
      </Stack>

      <Typography variant="h6" component="h2">
        Components
      </Typography>

      {isDraft && (
        <Alert severity="info">
          Nothing has moved yet. Releasing copies the recipe onto this run and
          issues the components.
        </Alert>
      )}

      {run.lines.length === 0 ? (
        <Alert severity="info">
          Components appear once the run is released — they are copied from the
          recipe then, so editing it afterwards cannot change this run.
        </Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Component</TableCell>
                <TableCell align="right">Planned</TableCell>
                <TableCell align="right">Used</TableCell>
                <TableCell>Supplied by</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {run.lines.map((line) => {
                const over =
                  Number(line.quantityConsumed) > Number(line.quantityPlanned);

                return (
                  <TableRow key={line.id}>
                    <TableCell>{line.sku}</TableCell>
                    <TableCell align="right">
                      {line.quantityPlanned} {line.unitOfMeasure}
                    </TableCell>
                    <TableCell
                      align="right"
                      sx={over ? { color: 'warning.main' } : undefined}
                    >
                      {line.supplyType === 'external'
                        ? '—'
                        : `${line.quantityConsumed} ${line.unitOfMeasure}`}
                    </TableCell>
                    <TableCell>
                      {line.supplyType === 'external' ? (
                        <Tooltip title="Never enters our stock, so nothing is consumed for it">
                          <Chip label="Manufacturer" size="small" />
                        </Tooltip>
                      ) : (
                        <Chip label="Us" size="small" variant="outlined" />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
      <ReleaseRunDialog
        open={releasing}
        runId={run.id}
        onClose={() => setReleasing(false)}
        onReleased={load}
      />
      <RecordOutputDialog
        open={recording}
        run={run}
        onClose={() => setRecording(false)}
        onRecorded={load}
      />
      <CloseRunDialog
        open={closing}
        run={run}
        onClose={() => setClosing(false)}
        onClosed={async (reported) => {
          setVariances(reported);
          await load();
        }}
      />
      <CancelRunDialog
        open={cancelling}
        run={run}
        onClose={() => setCancelling(false)}
        onCancelled={load}
      />
    </Stack>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Stack>
  );
}
