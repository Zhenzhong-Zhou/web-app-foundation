import { Link, Typography } from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { Reference } from '../components/reference';
import { openDialog } from '../lib/open-dialog';
import { StartTrackingDialog } from '../products/start-tracking-dialog';

/**
 * Under an item that does not track lots, in Receive stock and an order's
 * Receive (review 3): one grey line, "VITC-100 doesn't track lots, so no
 * lot is asked.", so a lot field missing is never a puzzle. For whoever
 * may start tracking, it ends with Start tracking lots…, which asks its
 * question over the dialog, as Found in a count opens Count it in…; once
 * started, the dialog reads the item again and shows its lot fields,
 * keeping what was typed. Closed without starting, focus is back on the
 * button (openDialog).
 */
export function NoLotLine({
  item,
  mayStart,
  onStarted,
}: {
  item: {
    productId: string;
    variantId: string;
    sku: string;
    unitOfMeasure: string;
  };
  /**
   * Whoever may start it, products.update and stock.adjust, as its route
   * asks (ADR-094, R13), and never for equipment, which tracks no lots.
   */
  mayStart: boolean;
  /** Started: the dialog reads the item again, its lot fields shown. */
  onStarted: () => void;
}) {
  const intl = useIntl();
  const [starting, setStarting] = useState(false);
  const sku = <Reference key="sku">{item.sku}</Reference>;

  return (
    <>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {mayStart
          ? intl.formatMessage(
              {
                id: 'inventory.lot.notTrackedStart',
                defaultMessage:
                  '{sku} doesn’t track lots, so no lot is asked. {start}',
              },
              {
                sku,
                start: (
                  <Link
                    key="start"
                    component="button"
                    type="button"
                    underline="always"
                    aria-label={intl.formatMessage(
                      {
                        id: 'products.variant.startTrackingOf',
                        defaultMessage: 'Start tracking lots for {sku}…',
                      },
                      { sku: item.sku },
                    )}
                    onClick={openDialog(() => setStarting(true))}
                    sx={{ verticalAlign: 'baseline' }}
                  >
                    {intl.formatMessage({
                      id: 'products.variant.startTracking',
                      defaultMessage: 'Start tracking lots…',
                    })}
                  </Link>
                ),
              },
            )
          : intl.formatMessage(
              {
                id: 'inventory.lot.notTracked',
                defaultMessage: '{sku} doesn’t track lots, so no lot is asked.',
              },
              { sku },
            )}
      </Typography>

      {starting && (
        <StartTrackingDialog
          productId={item.productId}
          variantId={item.variantId}
          sku={item.sku}
          unitOfMeasure={item.unitOfMeasure}
          onClose={() => setStarting(false)}
          onStarted={onStarted}
        />
      )}
    </>
  );
}
