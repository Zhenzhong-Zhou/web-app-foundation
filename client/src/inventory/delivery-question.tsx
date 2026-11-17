import {
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material';
import { useId } from 'react';
import { useIntl } from 'react-intl';

import type { Delivery } from '../api/types.gen';
import { NOT_ON_AN_ORDER, stillToCome } from './delivery-words';

/**
 * "Which delivery is this?", asked before receiving an item still to come
 * on a purchase (ADR-093, v3): each open order, its supplier, what is
 * still to come and when, and Not on an order. So ordered stock is never
 * received off its order by accident, which would leave the order open
 * and count the stock twice. Its value is a delivery's line id, or
 * NOT_ON_AN_ORDER.
 */
export function DeliveryQuestion({
  deliveries,
  value,
  onChange,
  error,
}: {
  deliveries: Delivery[];
  value: string;
  onChange: (value: string) => void;
  /** Why the answer is needed, when Continue was pressed without one. */
  error?: string;
}) {
  const intl = useIntl();
  const label = useId();

  return (
    <FormControl component="fieldset" error={!!error}>
      <FormLabel id={label} component="legend">
        {intl.formatMessage({
          id: 'inventory.receive.which',
          defaultMessage: 'Which delivery is this?',
        })}
      </FormLabel>
      <RadioGroup
        aria-labelledby={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {deliveries.map((delivery) => (
          <FormControlLabel
            key={delivery.line.id}
            value={delivery.line.id}
            control={<Radio />}
            sx={{ alignItems: 'flex-start', py: 0.5 }}
            label={
              <Stack sx={{ pt: 1 }}>
                <Typography>
                  {intl.formatMessage(
                    {
                      id: 'inventory.receive.deliveryOf',
                      defaultMessage: '{number} from {partner}',
                    },
                    { number: delivery.number, partner: delivery.partnerName },
                  )}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {stillToCome(delivery, intl)}
                </Typography>
              </Stack>
            }
          />
        ))}
        <FormControlLabel
          value={NOT_ON_AN_ORDER}
          control={<Radio />}
          label={intl.formatMessage({
            id: 'inventory.receive.notOnOrder',
            defaultMessage: 'Not on an order',
          })}
        />
      </RadioGroup>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}
