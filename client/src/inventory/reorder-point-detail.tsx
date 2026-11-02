import { Box, Link, Skeleton, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type {
  ReorderPointDetail as Detail,
  ReorderPointDraft,
  ReorderPointRow,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { ListError } from '../components/list-error';
import { StatusChip } from '../components/status-chip';
import { displayQuantity } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { displayWithUnit } from '../products/units';
import { atOrBelowZero } from './reorder-points';

/**
 * A document's number, linked to its page for someone who may read it, as
 * text for anyone else. A draft with no number yet says what it is.
 */
function DocumentLink({
  kind,
  id,
  number,
}: {
  kind: 'purchase' | 'sale' | 'run';
  id: string;
  number: string | null;
}) {
  const intl = useIntl();
  const can = useCan();
  const label =
    number ??
    intl.formatMessage(
      {
        id: 'inventory.reorder.unnumbered',
        defaultMessage:
          '{kind, select, run {Draft run} other {Draft purchase order}}',
      },
      { kind },
    );
  const to = kind === 'run' ? `/production/${id}` : `/orders/${id}`;
  const may = can(kind === 'run' ? 'production.view' : 'orders.view');

  return may ? (
    <Link component={RouterLink} to={to}>
      {label}
    </Link>
  ) : (
    <span>{label}</span>
  );
}

/** A line of a box: what it is on the left, how much on the right. */
function Line({
  children,
  quantity,
}: {
  children: ReactNode;
  quantity: string;
}) {
  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}
    >
      <Box sx={{ minWidth: 0 }}>{children}</Box>
      <Typography variant="body2" component="span">
        {displayQuantity(quantity)}
      </Typography>
    </Stack>
  );
}

/** One of the four boxes: its name, its total, and its lines. */
function Part({
  title,
  total,
  children,
  strong,
}: {
  title: string;
  total: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <Box
      sx={{
        flex: '1 1 0',
        minWidth: 0,
        p: 1.5,
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        bgcolor: 'background.paper',
      }}
    >
      <Stack spacing={0.75}>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {title}
        </Typography>
        <Typography
          variant="h6"
          component="p"
          sx={{
            fontWeight: 600,
            ...(strong && atOrBelowZero(total) && { color: 'error.main' }),
          }}
        >
          {total}
        </Typography>
        {children}
      </Stack>
    </Box>
  );
}

/** What a box says when it has no lines. */
function Nothing({ children }: { children: string }) {
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {children}
    </Typography>
  );
}

/** Each draft adding to an item, its number linked, and how much. */
export function DraftLines({ drafts }: { drafts: ReorderPointDraft[] }) {
  return drafts.map((draft) => (
    <Line key={`${draft.kind}-${draft.id}`} quantity={draft.quantity}>
      <DocumentLink kind={draft.kind} id={draft.id} number={draft.number} />
    </Line>
  ));
}

/**
 * An opened row (ADR-085): where its position comes from, in four boxes
 * that add up as the line above the list says. Usable by location, with
 * what was left out; each purchase and run on its way, late flagged; each
 * sale still needing it; and the position against its point, with the
 * rule, its suggestion and what is in draft. Read when the row opens,
 * from the server, which works the lines out as it works out the row.
 */
export function ReorderPointDetail({ row }: { row: ReorderPointRow }) {
  const intl = useIntl();
  const { data, error, loading, reload } = useResource<Detail>(
    `/stock/reorder-points/${row.variantId}`,
  );
  // Only for a read that takes a while (conventions, Loading states).
  const showSkeleton = useDelayedFlag(loading || !data);

  if (error) return <ListError error={error} onRetry={() => void reload()} />;
  if (loading || !data) return showSkeleton ? <Skeleton height={120} /> : null;

  const leftOut = [
    !atOrBelowZero(data.expired) &&
      intl.formatMessage(
        {
          id: 'inventory.reorder.leftOutExpired',
          defaultMessage: '{quantity} left out as expired',
        },
        { quantity: displayQuantity(data.expired) },
      ),
    !atOrBelowZero(data.issued) &&
      intl.formatMessage(
        {
          id: 'inventory.reorder.leftOutIssued',
          defaultMessage: '{quantity} left out as issued to a run',
        },
        { quantity: displayQuantity(data.issued) },
      ),
  ].filter((line): line is string => !!line);

  const rule = intl.formatMessage(
    {
      id: 'inventory.reorder.ruleLine',
      defaultMessage:
        '{rule, select, fixed {In multiples of {quantity}} maximum {Up to {quantity}} other {Just enough}}',
    },
    {
      rule: row.rule,
      quantity: displayQuantity(row.fixedQuantity ?? row.maximumQuantity ?? ''),
    },
  );

  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ py: 1 }}>
      <Part
        title={intl.formatMessage({
          id: 'inventory.reorder.box.usable',
          defaultMessage: 'Usable',
        })}
        total={displayWithUnit(row.usable, row.unitOfMeasure, intl)}
      >
        {data.usable.map((place) => (
          <Line key={place.locationId} quantity={place.usable}>
            <Typography variant="body2" component="span">
              {place.locationName}
            </Typography>
          </Line>
        ))}
        {!data.usable.length && (
          <Nothing>
            {intl.formatMessage({
              id: 'inventory.reorder.noneUsable',
              defaultMessage: 'Nothing usable.',
            })}
          </Nothing>
        )}
        {leftOut.map((line) => (
          <Typography
            key={line}
            variant="caption"
            sx={{ color: 'text.secondary' }}
          >
            {line}
          </Typography>
        ))}
      </Part>

      <Part
        title={intl.formatMessage({
          id: 'inventory.reorder.box.coming',
          defaultMessage: '+ Coming',
        })}
        total={displayQuantity(row.coming)}
      >
        {data.coming.map((supply) => (
          <Line key={`${supply.kind}-${supply.id}`} quantity={supply.quantity}>
            <Stack
              direction="row"
              useFlexGap
              spacing={0.75}
              sx={{ flexWrap: 'wrap', alignItems: 'center' }}
            >
              <DocumentLink
                kind={supply.kind}
                id={supply.id}
                number={supply.number}
              />
              <Typography
                variant="body2"
                component="span"
                sx={{ color: 'text.secondary' }}
              >
                {supply.kind === 'run'
                  ? intl.formatMessage({
                      id: 'inventory.reorder.comingRun',
                      defaultMessage: 'Production run',
                    })
                  : supply.partnerName}
              </Typography>
              {supply.late && (
                <StatusChip
                  tone="critical"
                  label={intl.formatMessage({
                    id: 'inventory.reorder.late',
                    defaultMessage: 'Late',
                  })}
                />
              )}
            </Stack>
          </Line>
        ))}
        {!data.coming.length && (
          <Nothing>
            {intl.formatMessage({
              id: 'inventory.reorder.noneComing',
              defaultMessage: 'Nothing on its way.',
            })}
          </Nothing>
        )}
      </Part>

      <Part
        title={intl.formatMessage({
          id: 'inventory.reorder.box.stillNeeded',
          defaultMessage: '− Still needed',
        })}
        total={displayQuantity(row.stillNeeded)}
      >
        {data.stillNeeded.map((sale) => (
          <Line key={sale.orderId} quantity={sale.quantity}>
            <Stack
              direction="row"
              useFlexGap
              spacing={0.75}
              sx={{ flexWrap: 'wrap' }}
            >
              <DocumentLink
                kind="sale"
                id={sale.orderId}
                number={sale.number}
              />
              <Typography
                variant="body2"
                component="span"
                sx={{ color: 'text.secondary' }}
              >
                {sale.partnerName}
              </Typography>
            </Stack>
          </Line>
        ))}
        {!data.stillNeeded.length && (
          <Nothing>
            {intl.formatMessage({
              id: 'inventory.reorder.noneNeeded',
              defaultMessage: 'No sale is waiting for it.',
            })}
          </Nothing>
        )}
      </Part>

      <Part
        title={intl.formatMessage({
          id: 'inventory.reorder.box.position',
          defaultMessage: '= Position',
        })}
        total={displayQuantity(row.position)}
        strong
      >
        <Line quantity={row.reorderPoint}>
          <Typography variant="body2" component="span">
            {intl.formatMessage({
              id: 'inventory.reorder.point',
              defaultMessage: 'Reorder point',
            })}
          </Typography>
        </Line>
        <Line quantity={row.suggestion}>
          <Typography variant="body2" component="span">
            {intl.formatMessage(
              {
                id: 'inventory.reorder.suggestedBy',
                defaultMessage:
                  '{rule} · {source, select, other {suggested order}}',
              },
              { rule, source: row.source },
            )}
          </Typography>
        </Line>
        {/* What is in draft is the row's own, as the list sent it. */}
        {!!row.drafts.length && (
          <>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {intl.formatMessage({
                id: 'inventory.reorder.inDraft',
                defaultMessage: 'In draft',
              })}
            </Typography>
            <DraftLines drafts={row.drafts} />
          </>
        )}
      </Part>
    </Stack>
  );
}
