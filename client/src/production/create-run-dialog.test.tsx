import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { CreateRunDialog } from './create-run-dialog';

const VARIANT = {
  id: 'variant-focus',
  sku: 'FOCUS-60CT',
  variantName: null,
  productName: 'Focus',
  unitOfMeasure: 'each',
  tracksLots: true,
};

describe('CreateRunDialog', () => {
  /**
   * The select shows the active recipe as soon as an item is chosen. Sending
   * only a recipe somebody clicked planned the run with none — twice, once
   * as the original bug and once as a regression.
   */
  it('plans with the recipe the select is showing', async () => {
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];

    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () =>
        HttpResponse.json([
          { id: 'loc-wip', name: 'WIP', type: 'bin', parentId: null },
        ]),
      ),
      http.get('/api/v1/partners', () => HttpResponse.json([])),
      http.get('/api/v1/boms', () =>
        HttpResponse.json([
          {
            id: 'bom-active',
            outputVariantId: VARIANT.id,
            version: 1,
            status: 'active',
            outputQuantity: '1000.0000',
          },
        ]),
      ),
      http.post('/api/v1/production-orders', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { productionOrder: { id: 'run-1' } },
          { status: 201 },
        );
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await user.type(await screen.findByLabelText(/Making/), 'FOCUS');
    await user.click(await screen.findByRole('option', { name: /FOCUS-60CT/ }));
    await user.type(screen.getByLabelText(/Quantity to make/), '1000');
    await user.click(screen.getByLabelText(/Made at/));
    await user.click(await screen.findByRole('option', { name: /WIP/ }));

    await user.click(screen.getByRole('button', { name: 'Plan run' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].bomId).toBe('bom-active');
  });
});
