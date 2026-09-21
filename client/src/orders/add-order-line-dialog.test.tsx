import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { OrderDetail, OrderLine } from '../lib/types';
import { VARIANTS } from '../test/handlers';
import { server } from '../test/setup';
import { AddOrderLineDialog } from './add-order-line-dialog';

const ORDER = {
  id: 'order-1',
  status: 'draft',
  lines: [] as OrderLine[],
} as OrderDetail;

function dialog(open: boolean, order: OrderDetail = ORDER) {
  return (
    <AddOrderLineDialog
      open={open}
      order={order}
      onClose={() => undefined}
      onAdded={() => undefined}
    />
  );
}

async function openItems() {
  await userEvent
    .setup()
    .click(await screen.findByRole('combobox', { name: 'Item' }));
}

describe('AddOrderLineDialog', () => {
  /**
   * The case fetch-on-open exists for. The page has been open a while; a
   * variant is created in another tab; the picker must offer it without a
   * reload. A catalogue handed down from page load would not.
   */
  it('offers a variant created after the page loaded', async () => {
    const { rerender } = render(dialog(false));

    server.use(
      http.get('/api/v1/products/variants', () =>
        HttpResponse.json([
          ...VARIANTS,
          { ...VARIANTS[0], id: 'variant-new', sku: 'NEW-1' },
        ]),
      ),
    );

    rerender(dialog(true));
    await openItems();

    expect(
      await screen.findByRole('option', { name: /NEW-1/ }),
    ).toBeInTheDocument();
  });

  // One line per variant: the server refuses a duplicate with a 409.
  it('leaves out items already on the order', async () => {
    const onOrder = {
      ...ORDER,
      lines: [{ id: 'line-1', variantId: 'variant-plain' } as OrderLine],
    };

    render(dialog(true, onOrder));
    await openItems();

    expect(
      await screen.findByRole('option', { name: /LOTTED-1/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /PLAIN-1/ }),
    ).not.toBeInTheDocument();
  });
});
