import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { RunCost } from '../lib/types';
import { server } from '../test/setup';
import { RunCostPanel } from './run-cost-panel';

/**
 * What the panel says about the figures the server sends. The figures
 * themselves are the server's (ADR-025); this checks the wording around them
 * — provisional, nothing made — which is where a reader could be misled.
 */

const COST: RunCost = {
  currency: 'CAD',
  runId: 'run-1',
  reference: 'FOC-2609-01',
  sku: 'FOCUS-60CT',
  status: 'completed',
  closed: true,
  quantityProduced: '980.0000',
  materialCost: '1240.000000',
  unitCost: '1.265306',
  provisional: false,
  consumed: [
    {
      sku: 'BLEND-FOCUS',
      lotCode: 'BF-2609',
      quantity: '30.0000',
      value: '1140.000000',
    },
  ],
  outputs: [{ lotCode: 'FOC-1', quantity: '980.0000', value: '1240.000000' }],
};

function serve(cost: RunCost) {
  server.use(
    http.get('/api/v1/costs/runs/run-1', () =>
      HttpResponse.json({ runCost: cost }),
    ),
  );
}

describe('RunCostPanel', () => {
  it('shows the material cost, the unit cost to four places, and what was used', async () => {
    serve(COST);
    render(<RunCostPanel runId="run-1" />);

    expect(await screen.findByText(/1\.2653/)).toBeInTheDocument();
    expect(screen.getAllByText(/1,240\.00/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('table', { name: 'What it used' }),
    ).toHaveTextContent('BF-2609');
    expect(screen.queryByText('Provisional')).not.toBeInTheDocument();
  });

  it('warns when something it used was still waiting for a cost', async () => {
    serve({ ...COST, provisional: true });
    render(<RunCostPanel runId="run-1" />);

    expect(await screen.findByText('Provisional')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/figures are low/);
  });

  it('says nothing was made rather than showing a unit cost', async () => {
    serve({ ...COST, quantityProduced: '0.0000', unitCost: null, outputs: [] });
    render(<RunCostPanel runId="run-1" />);

    expect(await screen.findByText('Nothing was made')).toBeInTheDocument();
    expect(
      screen.queryByRole('table', { name: 'What it made' }),
    ).not.toBeInTheDocument();
  });
});
