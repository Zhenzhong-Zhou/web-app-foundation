import { Stack } from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { PriceListPicker } from './price-list-picker';

/**
 * Which lists a partner's orders take their default prices from (ADR-049).
 * One for sales to them and one for purchases from them: a partner is a
 * customer or a supplier by what it is on an order, not by a flag.
 *
 * Remounted by a key on the caller when the partner reloads, so the form is
 * seeded from props and never resyncs in an effect.
 */
export function PartnerPriceLists({
  partnerId,
  salePriceListId,
  purchasePriceListId,
  readOnly,
  onSaved,
}: {
  partnerId: string;
  salePriceListId: string | null;
  purchasePriceListId: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [sale, setSale] = useState(salePriceListId);
  const [purchase, setPurchase] = useState(purchasePriceListId);

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: 'Price lists saved',
  });

  const changed = sale !== salePriceListId || purchase !== purchasePriceListId;

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/partners/${partnerId}`, {
        method: 'PATCH',
        // null clears a list; both sent, so the form says the whole state.
        body: JSON.stringify({
          salePriceListId: sale,
          purchasePriceListId: purchase,
        }),
      }),
    );
  }

  return (
    <SettingsSection
      title="Price lists"
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel="Save price lists"
      saveDisabled={!changed}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <PriceListPicker
          id="partner-sale-price-list"
          label="Sales to them"
          direction="sale"
          value={sale}
          onChange={setSale}
          disabled={readOnly}
          helperText="Prices a sale line added without one."
        />
        <PriceListPicker
          id="partner-purchase-price-list"
          label="Purchases from them"
          direction="purchase"
          value={purchase}
          onChange={setPurchase}
          disabled={readOnly}
          helperText="Prices a purchase line added without one."
        />
      </Stack>
    </SettingsSection>
  );
}
