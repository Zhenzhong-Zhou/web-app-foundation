import { Alert, Skeleton, Stack, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { CurrencyField } from '../components/currency-field';
import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import type { OrganizationProfile } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { useSubmit } from '../lib/use-submit';
import { DefaultSaleListForm } from '../price-lists/default-sale-list-form';

/**
 * What the organization prints as the seller on every invoice (ADR-046) —
 * its tax registration number and registered address — and the currency its
 * stock is valued in (ADR-048).
 *
 * Small forms rather than one, because they are changed for different
 * reasons — a new registration, an office move, the first costed receipt.
 * Anyone can read them; only the Owner changes them.
 */
export function OrganizationPage() {
  const can = useCan();
  const { data, error, reload } = useResource<{
    organization: OrganizationProfile;
  }>('/organization');
  const organization = data?.organization ?? null;

  const showSkeleton = useDelayedFlag(organization === null && !error);
  const canUpdate = can('organizations.update');

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {organization?.name ?? 'Organization'}
        </Typography>
        {organization && <HistoryButton resourceId={organization.id} />}
      </Stack>

      <Typography variant="body2" color="text.secondary">
        Every invoice prints these as the seller, copied on the day it is issued
        — changing them here never changes an invoice already sent. Invoices
        cannot be issued until the registered address is set.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {organization ? (
        <>
          {/* Keyed on what was saved, so a reload resets each form. */}
          <TaxNumberForm
            key={organization.taxRegistrationNumber ?? ''}
            value={organization.taxRegistrationNumber}
            readOnly={!canUpdate}
            onSaved={reload}
          />
          <AddressForm
            key={JSON.stringify(organization.address)}
            address={organization.address}
            readOnly={!canUpdate}
            onSaved={reload}
          />
          <BaseCurrencyForm
            key={organization.baseCurrency ?? ''}
            value={organization.baseCurrency}
            readOnly={!canUpdate}
            onSaved={reload}
          />
          {can('price_lists.view') && (
            <DefaultSaleListForm
              key={organization.defaultSalePriceListId ?? ''}
              value={organization.defaultSalePriceListId}
              readOnly={!canUpdate}
              onSaved={reload}
            />
          )}
        </>
      ) : showSkeleton ? (
        <Skeleton variant="rounded" height={240} />
      ) : null}
    </Stack>
  );
}

function TaxNumberForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [taxNumber, setTaxNumber] = useState(value ?? '');
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: 'Tax number saved',
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Empty clears it: not every organization is registered.
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ taxRegistrationNumber: taxNumber.trim() }),
      }),
    );
  }

  return (
    <SettingsSection
      title="Tax registration"
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel="Save tax number"
    >
      <TextField
        id="organization-tax-number"
        label="Tax registration number"
        fullWidth
        value={taxNumber}
        onChange={(event) => setTaxNumber(event.target.value)}
        disabled={readOnly}
        helperText="GST/HST, VAT, ABN — as issued. Leave blank if not registered."
        slotProps={{ htmlInput: { maxLength: 50 } }}
      />
    </SettingsSection>
  );
}

const EMPTY_ADDRESS = {
  line1: '',
  line2: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
};

function AddressForm({
  address,
  readOnly,
  onSaved,
}: {
  address: OrganizationProfile['address'];
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState(
    address
      ? {
          line1: address.line1,
          line2: address.line2 ?? '',
          city: address.city ?? '',
          region: address.region ?? '',
          postalCode: address.postalCode ?? '',
          country: address.country,
        }
      : EMPTY_ADDRESS,
  );

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: 'Registered address saved',
  });

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Sent whole: a field left blank is cleared, as the PUT says.
    void submit(() =>
      api('/organization/address', {
        method: 'PUT',
        body: JSON.stringify({
          line1: form.line1,
          line2: form.line2 || undefined,
          city: form.city || undefined,
          region: form.region || undefined,
          postalCode: form.postalCode || undefined,
          country: form.country,
        }),
      }),
    );
  }

  return (
    <SettingsSection
      title="Registered address"
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel="Save address"
      notice={
        !address &&
        !readOnly && (
          <Alert severity="info">
            Not set yet. Invoices print this, so none can be issued until it is.
          </Alert>
        )
      }
    >
      <TextField
        id="organization-line1"
        label="Address line 1"
        required
        fullWidth
        value={form.line1}
        onChange={update('line1')}
        disabled={readOnly}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />
      <TextField
        id="organization-line2"
        label="Address line 2"
        fullWidth
        value={form.line2}
        onChange={update('line2')}
        disabled={readOnly}
        slotProps={{ htmlInput: { maxLength: 200 } }}
      />

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          id="organization-city"
          label="City"
          fullWidth
          value={form.city}
          onChange={update('city')}
          disabled={readOnly}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        <TextField
          id="organization-region"
          label="Province or state"
          fullWidth
          value={form.region}
          onChange={update('region')}
          disabled={readOnly}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          id="organization-postal-code"
          label="Postal code"
          fullWidth
          value={form.postalCode}
          onChange={update('postalCode')}
          disabled={readOnly}
          slotProps={{ htmlInput: { maxLength: 32 } }}
        />
        <TextField
          id="organization-country"
          label="Country"
          required
          fullWidth
          value={form.country}
          onChange={update('country')}
          disabled={readOnly}
          helperText="Two letters: CA, US."
          slotProps={{ htmlInput: { maxLength: 2 } }}
        />
      </Stack>
    </SettingsSection>
  );
}

/**
 * What stock is valued in (ADR-048). Set once, before the first costed
 * receipt: until then every receipt waits for a cost, and once anything
 * carries a value the server refuses a change, because every stored value
 * would silently change currency with it.
 */
function BaseCurrencyForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const [currency, setCurrency] = useState(value ?? '');
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: 'Base currency saved',
  });

  const trimmed = currency.trim().toUpperCase();

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ baseCurrency: trimmed }),
      }),
    );
  }

  return (
    <SettingsSection
      title="Base currency"
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel="Save base currency"
      saveDisabled={trimmed.length !== 3 || trimmed === value}
      notice={
        !value &&
        !readOnly && (
          <Alert severity="info">
            Not set yet. Stock received before it is set waits for a cost.
          </Alert>
        )
      }
    >
      <CurrencyField
        id="organization-base-currency"
        label="Base currency"
        value={currency}
        onChange={setCurrency}
        disabled={readOnly}
        helperText="What stock is valued in: CAD, USD. It cannot change once stock carries a value in it."
        sx={{ maxWidth: 240 }}
      />
    </SettingsSection>
  );
}
