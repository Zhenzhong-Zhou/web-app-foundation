import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { OFFER_BACK } from './offer-back';
import { useTab } from './use-tab';

const TABS = ['items', 'shipments', 'returns'] as const;

function Probe({
  tabs = TABS,
  fallback,
}: {
  tabs?: readonly (typeof TABS)[number][];
  fallback?: (typeof TABS)[number];
}) {
  const [tab, choose] = useTab(tabs, { fallback });
  const location = useLocation();
  const navigation = useNavigationType();

  return (
    <>
      <p>tab {tab}</p>
      <p>search {location.search || 'none'}</p>
      <p>navigation {navigation}</p>
      <p>state {JSON.stringify(location.state)}</p>
      <button onClick={() => choose('shipments')}>shipments</button>
      <button onClick={() => choose('items')}>items</button>
    </>
  );
}

function renderAt(
  entry: string | { pathname: string; search?: string; state: unknown },
  tabs?: readonly (typeof TABS)[number][],
) {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Probe tabs={tabs} />
    </MemoryRouter>,
  );
}

describe('useTab', () => {
  // Items opens on the first type it holds, not the first tab (ADR-092).
  it('opens on the fallback with no parameter, and writes none for it', async () => {
    render(
      <MemoryRouter initialEntries={['/orders/1']}>
        <Probe fallback="shipments" />
      </MemoryRouter>,
    );

    expect(screen.getByText('tab shipments')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'items' }));
    expect(screen.getByText('search ?tab=items')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'shipments' }));
    expect(screen.getByText('search none')).toBeInTheDocument();
  });

  // Opened by a link that offered Back, choosing a tab keeps it (#341).
  it('keeps the state the page was opened with', async () => {
    renderAt({ pathname: '/orders/1', state: OFFER_BACK });

    await userEvent.click(screen.getByRole('button', { name: 'shipments' }));

    expect(screen.getByText('tab shipments')).toBeInTheDocument();
    expect(
      screen.getByText(`state ${JSON.stringify(OFFER_BACK)}`),
    ).toBeInTheDocument();
  });

  it('opens the tab the address names', () => {
    renderAt('/orders/1?tab=shipments');

    expect(screen.getByText('tab shipments')).toBeInTheDocument();
  });

  it('opens the first tab when the address names none', () => {
    renderAt('/orders/1');

    expect(screen.getByText('tab items')).toBeInTheDocument();
    expect(screen.getByText('search none')).toBeInTheDocument();
  });

  it('opens the first tab for one that does not exist, and corrects the address', async () => {
    renderAt('/orders/1?tab=nonsense');

    expect(screen.getByText('tab items')).toBeInTheDocument();
    expect(await screen.findByText('search none')).toBeInTheDocument();
  });

  /** Returns is left out of the list, as a tab without permission is. */
  it('treats a tab the person may not see like one that does not exist', async () => {
    renderAt('/orders/1?tab=returns', ['items', 'shipments']);

    expect(screen.getByText('tab items')).toBeInTheDocument();
    expect(await screen.findByText('search none')).toBeInTheDocument();
  });

  it('switches by replacing the address, and drops it for the first tab', async () => {
    renderAt('/orders/1');

    await userEvent.click(screen.getByRole('button', { name: 'shipments' }));
    expect(screen.getByText('tab shipments')).toBeInTheDocument();
    expect(screen.getByText('search ?tab=shipments')).toBeInTheDocument();
    expect(screen.getByText('navigation REPLACE')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'items' }));
    expect(screen.getByText('search none')).toBeInTheDocument();
  });

  it('keeps the address’s other parameters', async () => {
    renderAt('/invoices/1?credit=rma-1');

    await userEvent.click(screen.getByRole('button', { name: 'shipments' }));
    expect(
      screen.getByText('search ?credit=rma-1&tab=shipments'),
    ).toBeInTheDocument();
  });
});
