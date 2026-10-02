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
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { Fragment, type ReactNode, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { LabelledValue } from '../components/labelled-value';
import { PageHeader } from '../components/page-header';
import { RunCostPanel } from '../costs/run-cost-panel';
import { openDialog } from '../lib/open-dialog';
import type { LineVariance, OutputVariance, RunDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { LicenceAtRelease } from '../licences/licence-at-release';
import { CancelRunDialog } from './cancel-run-dialog';
import { CloseRunDialog } from './close-run-dialog';
import { RecordOutputDialog } from './record-output-dialog';
import { ReleaseRunDialog } from './release-run-dialog';
import { STATUS_COLOUR, STATUS_LABEL } from './status';

export function ProductionOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const can = useCan();

  const {
    data: run,
    error,
    loading,
    reload,
  } = useResource<RunDetail>(`/production-orders/${id!}`);
  const [variances, setVariances] = useState<LineVariance[]>([]);
  const [outputVariance, setOutputVariance] = useState<OutputVariance | null>(
    null,
  );

  const [releasing, setReleasing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [closing, setClosing] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const canRelease = can('production.release');
  const canComplete = can('production.complete');
  const canOverrideLicence = can('production.override_licence');

  const showSkeleton = useDelayedFlag(loading);

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

  /**
   * "EARLY: 1500.0000 · LATE: 900.0000" for one component, or null, with each
   * code a link to that lot's trace — the step a recall takes next (ADR-044).
   */
  const lotsFor = (componentVariantId: string): ReactNode => {
    const used = run.componentLots.filter(
      (lot) => lot.componentVariantId === componentVariantId,
    );
    if (used.length === 0) return null;

    return used.map((lot, index) => (
      <Fragment key={lot.lotId}>
        {index > 0 && ' · '}
        <Link component={RouterLink} to={`/lots/${lot.lotId}`} color="inherit">
          {lot.code}
        </Link>
        {run.status === 'completed'
          ? `: ${lot.consumed} used`
          : `: ${lot.issued}`}
      </Fragment>
    ));
  };

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[{ label: 'Production', to: '/production' }]}
        title={run.reference ?? `${run.quantityPlanned} planned`}
        status={{
          label: STATUS_LABEL[run.status],
          color: STATUS_COLOUR[run.status],
        }}
        actions={
          <Stack direction="row" spacing={1}>
            <HistoryButton resourceId={run.id} />
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

      {/* The yield against its plan, on the same threshold as the
          components and shown the same way: once, at the moment somebody can
          act on it. Recorded, never refused (ADR-032). */}
      {outputVariance && (
        <Alert severity="warning">
          This run made {outputVariance.quantityProduced} against a plan of{' '}
          {outputVariance.quantityPlanned} —{' '}
          {Math.round(outputVariance.variance * 100)}% off. Worth checking the
          yield on the recipe, or whether output was recorded twice.
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

      {/* Wraps, because "Made under" can be a sentence once an override is
          on it, and four facts in a row do not fit a phone. */}
      <Stack
        direction="row"
        spacing={4}
        useFlexGap
        sx={{ flexWrap: 'wrap', rowGap: 2 }}
      >
        <LabelledValue label="Produced so far" value={run.quantityProduced} />
        <LabelledValue
          label="Made by"
          value={run.partnerId ? 'Contract manufacturer' : 'In house'}
        />
        <LabelledValue
          label="Batches"
          value={run.outputLots.length ? String(run.outputLots.length) : '—'}
        />
        {/* What the batch was made under, and how that licence stood at
            release (ADR-050). Nothing is copied before release, so a draft
            shows a dash rather than the recipe's licence of today. */}
        <LabelledValue
          label="Made under"
          value={
            isDraft ? (
              '—'
            ) : (
              <LicenceAtRelease
                run={run}
                linkToLicences={can('product_licences.view')}
              />
            )
          }
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
          <TableContainer>
            <Table size="small" aria-label="Components">
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
                    Number(line.quantityConsumed) >
                    Number(line.quantityPlanned);

                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.sku}
                        {/* Which lots went in: the recall trail, visible
                            rather than only stored (ADR-039). */}
                        {lotsFor(line.componentVariantId) && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            component="div"
                          >
                            {lotsFor(line.componentVariantId)}
                          </Typography>
                        )}
                      </TableCell>
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
          </TableContainer>
        </Paper>
      )}

      {run.status === 'completed' && can('costs.view') && (
        <RunCostPanel runId={run.id} />
      )}

      <ReleaseRunDialog
        open={releasing}
        run={run}
        canOverrideLicence={canOverrideLicence}
        onClose={() => setReleasing(false)}
        onReleased={reload}
      />
      <RecordOutputDialog
        open={recording}
        run={run}
        onClose={() => setRecording(false)}
        onRecorded={reload}
      />
      <CloseRunDialog
        open={closing}
        run={run}
        onClose={() => setClosing(false)}
        onClosed={async (result) => {
          setVariances(result.variances);
          setOutputVariance(result.outputVariance);
          await reload();
        }}
      />
      <CancelRunDialog
        open={cancelling}
        run={run}
        onClose={() => setCancelling(false)}
        onCancelled={reload}
      />
    </Stack>
  );
}
