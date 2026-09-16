import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { RunDetail } from '../lib/types';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProductionOrderDetailPage } from './production-order-detail-page';

/**
 * The branches that matter here are all status-dependent, and reaching them
 * in the browser means planning, releasing, producing, and closing a run
 * against a real database for each one.
 */

const ALL = [
  'production.view',
  'production.create',
  'production.release',
  'production.complete',
];

const BASE: RunDetail = {
  id: 'run-1',
  outputVariantId: 'variant-output',
  bomId: 'bom-1',
  partnerId: null,
  locationId: 'loc-wip',
  quantityPlanned: '500.0000',
  quantityProduced: '0.0000',
  status: 'draft',
  notes: null,
  createdAt: '2026-09-15T10:00:00.000Z',
  lines: [],
  outputLots: [],
};

const RELEASED: RunDetail = {
  ...BASE,
  status: 'released',
  lines: [
    {
      id: 'line-blend',
      componentVariantId: 'variant-plain',
      sku: 'BLEND-D3',
      unitOfMeasure: 'g',
      quantityPlanned: '1200.0000',
      quantityConsumed: '0.0000',
      supplyType: 'stocked',
      sourceLocationId: 'loc-shelf',
      externalLotCode: null,
    },
    {
      id: 'line-bottle',
      componentVariantId: 'variant-lotted',
      sku: 'BOTTLE',
      unitOfMeasure: 'each',
      quantityPlanned: '500.0000',
      quantityConsumed: '0.0000',
      supplyType: 'external',
      sourceLocationId: null,
      externalLotCode: null,
    },
  ],
};

function serve(run: RunDetail) {
  server.use(
    http.get('/api/v1/production-orders/:id', () => HttpResponse.json(run)),
  );
}

function renderPage(permissions = ALL) {
  return renderWithAuth(
    <MemoryRouter initialEntries={['/production/run-1']}>
      <Routes>
        <Route path="/production/:id" element={<ProductionOrderDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

describe('ProductionOrderDetailPage', () => {
  it('offers only release while the run is planned', async () => {
    serve(BASE);
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Release' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record output' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Close run' }),
    ).not.toBeInTheDocument();
  });

  it('explains that components arrive at release, not before', async () => {
    serve(BASE);
    renderPage();

    expect(
      await screen.findByText(/copied from the recipe then/),
    ).toBeInTheDocument();
  });

  it('offers output and close once released, and not release again', async () => {
    serve(RELEASED);
    renderPage();

    expect(
      await screen.findByRole('button', { name: 'Record output' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Close run' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Release' }),
    ).not.toBeInTheDocument();
  });

  /**
   * An external component has no consumed quantity because it never entered
   * our stock — showing 0 would read as "none used", which is wrong in a
   * different way.
   */
  it('shows a dash rather than zero for a component we never held', async () => {
    serve(RELEASED);
    renderPage();

    const row = (await screen.findByText('BOTTLE')).closest('tr')!;

    expect(within(row).getByText('Manufacturer')).toBeInTheDocument();
    // Not "0.0000": we never held it, so none-used would be a different claim.
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('warns that issued material stays put when cancelling a released run', async () => {
    serve(RELEASED);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    expect(
      await screen.findByText(/stay where the run is/),
    ).toBeInTheDocument();
  });

  it('does not warn about material when cancelling a plan', async () => {
    serve(BASE);
    renderPage();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Cancel' }),
    );

    expect(await screen.findByLabelText(/Why/)).toBeInTheDocument();
    expect(screen.queryByText(/stay where the run is/)).not.toBeInTheDocument();
  });

  it('hides every action from someone who can only look', async () => {
    serve(RELEASED);
    renderPage(['production.view']);

    expect(await screen.findByText('BLEND-D3')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Record output' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Cancel' }),
    ).not.toBeInTheDocument();
  });

  it('surfaces a refusal from the server', async () => {
    serve(BASE);
    server.use(
      http.get('/api/v1/production-orders/:id', () =>
        apiError(404, 'No such production order'),
      ),
    );

    renderPage();

    expect(
      await screen.findByText('No such production order'),
    ).toBeInTheDocument();
  });
});
