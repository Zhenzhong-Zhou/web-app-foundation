import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import { Link, Typography } from '@mui/material';
import type { ReactElement } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { StatusChip } from '../components/status-chip';
import type { ReorderStatus } from '../lib/api-names';
import { displayQuantity } from '../lib/format';
import { whereItStands } from '../lib/item-path';
import { OFFER_BACK } from '../lib/offer-back';
import { STATUS_TONES } from '../theme/status';

/** Each status's icon beside its word, so it is never told by colour alone. */
const STATUS_ICONS: Partial<Record<ReorderStatus, ReactElement>> = {
  out: <ErrorOutlined />,
  low: <WarningAmberOutlined />,
  enough: <CheckCircleOutlined />,
};

/**
 * An item's reorder status in Home's words, in its tone (ADR-085; ADR-093,
 * R20): the one chip Stock, Reorder and Where it stands draw; with
 * `withIcon`, its icon before the word, as Reorder's list shows it.
 */
export function ReorderStatusChip({
  status,
  withIcon = false,
}: {
  status: ReorderStatus;
  withIcon?: boolean;
}) {
  const intl = useIntl();

  return (
    <StatusChip
      tone={STATUS_TONES.reorder[status]}
      icon={withIcon ? STATUS_ICONS[status] : undefined}
      label={intl.formatMessage(
        {
          id: 'inventory.reorder.status',
          defaultMessage:
            '{status, select, out {Out} low {Low} enough {Enough} other {Discontinued}}',
        },
        { status },
      )}
    />
  );
}

/**
 * "10 left · reorder at 36", the line a status judges (the design
 * language's Numbers): a link to the item's Where it stands on a list, the
 * words alone where it stands already.
 */
export function LeftLine({
  position,
  reorderPoint,
  productId,
}: {
  position: string;
  reorderPoint: string;
  /** The item whose Where it stands the line opens; none, plain words. */
  productId?: string;
}) {
  const intl = useIntl();
  const words = intl.formatMessage(
    {
      id: 'inventory.stock.left',
      defaultMessage: '{left} left · reorder at {point}',
    },
    {
      left: displayQuantity(position),
      point: displayQuantity(reorderPoint),
    },
  );

  if (!productId) return <Typography>{words}</Typography>;
  return (
    <Link
      component={RouterLink}
      to={whereItStands(productId)}
      state={OFFER_BACK}
      variant="body2"
      // One line in a table; on a phone it wraps, as French at Larger
      // text is wider than 320 px beside its chip (cut-text, Linux).
      sx={{ whiteSpace: { xs: 'normal', sm: 'nowrap' } }}
    >
      {words}
    </Link>
  );
}
