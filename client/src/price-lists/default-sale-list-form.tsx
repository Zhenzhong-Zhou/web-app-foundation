import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { SettingsSection } from '../components/settings-section';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { PriceListPicker } from './price-list-picker';

/**
 * The sale list for customers with none of their own (ADR-049). No purchase
 * default: a supplier's price is specific to the supplier.
 */
export function DefaultSaleListForm({
  value,
  readOnly,
  onSaved,
}: {
  value: string | null;
  readOnly: boolean;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [listId, setListId] = useState(value);

  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'priceLists.default.saved',
      defaultMessage: 'Default price list saved',
    }),
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({ defaultSalePriceListId: listId }),
      }),
    );
  }

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'priceLists.default.title',
        defaultMessage: 'Default sale price list',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={readOnly}
      saveLabel={intl.formatMessage({
        id: 'priceLists.default.save',
        defaultMessage: 'Save default',
      })}
      saveDisabled={listId === value}
    >
      <PriceListPicker
        id="organization-default-sale-list"
        label={intl.formatMessage({
          id: 'priceLists.default.label',
          defaultMessage: 'Default for customers',
        })}
        direction="sale"
        value={listId}
        onChange={setListId}
        disabled={readOnly}
        helperText={intl.formatMessage({
          id: 'priceLists.default.help',
          defaultMessage: 'Used when a customer has no list of their own.',
        })}
      />
    </SettingsSection>
  );
}
