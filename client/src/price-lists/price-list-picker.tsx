import { MenuItem, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { PriceList, PriceListDirection } from '../lib/types';

/**
 * Chooses a list of one direction, or none (ADR-049).
 *
 * Fetches its own lists, filtered by direction on the server, so a customer's
 * picker never offers a purchase list the server would refuse. A retired list
 * is offered only when it is the current choice, disabled, so the field still
 * says what is set without inviting anyone to set it again.
 */
export function PriceListPicker({
  id,
  label,
  direction,
  value,
  onChange,
  disabled = false,
  helperText,
}: {
  id: string;
  label: string;
  direction: PriceListDirection;
  value: string | null;
  onChange: (priceListId: string | null) => void;
  disabled?: boolean;
  helperText?: string;
}) {
  const [lists, setLists] = useState<PriceList[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;

    void api<{ priceLists: PriceList[] }>(`/price-lists?direction=${direction}`)
      .then((response) => {
        if (!ignore) setLists(response.priceLists);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });

    return () => {
      ignore = true;
    };
  }, [direction]);

  const shown = (lists ?? []).filter(
    (list) => list.isActive || list.id === value,
  );

  return (
    <TextField
      id={id}
      select
      label={label}
      value={lists === null ? '' : (value ?? '')}
      onChange={(event) => onChange(event.target.value || null)}
      disabled={disabled || lists === null}
      helperText={failed ? 'Could not load the price lists.' : helperText}
      fullWidth
    >
      <MenuItem value="">
        <em>None</em>
      </MenuItem>
      {shown.map((list) => (
        <MenuItem key={list.id} value={list.id} disabled={!list.isActive}>
          {list.name} ({list.currency}){list.isActive ? '' : ' — retired'}
        </MenuItem>
      ))}
    </TextField>
  );
}
