import { ThemeProvider } from '@mui/material/styles';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Location } from '../api/types.gen';
import { ReceiveStockDialog } from '../inventory/receive-stock-dialog';
import { ProductsPage } from '../products/products-page';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import {
  deploy,
  OUTDATED,
  outdatedRefusal,
  serveVersion,
} from '../test/version';
import { themeFor } from '../theme';

/**
 * An outdated tab's refusals on screen (ADR-081): a page whose read is
 * refused, and a dialog whose save is, for each code, and the new version
 * still on its way when the API has deployed before the static site.
 */

const INSTALLING =
  'A new version is being installed. Try again in a minute; nothing was saved.';
const LINE =
  'A new version is ready, and this tab can no longer save changes. Copy anything you’ve typed, then reload.';

const deployed = () => serveVersion({ urgent: true });

/**
 * The read every 30 seconds while the new version is on its way, which
 * finds it out: called here rather than waited for, as version-check's own
 * tests wait for it.
 */
const outNow = () => deploy({ urgent: true });

const LOCATIONS: Location[] = [
  {
    id: 'location-a',
    type: 'site',
    name: 'Main Site',
    code: 'MAIN',
    parentId: null,
    isAvailable: true,
    isActive: true,
    address: null,
  },
];

describe('a dialog’s save refused', () => {
  function open() {
    renderWithAuth(
      <ThemeProvider theme={themeFor('en')}>
        <ReceiveStockDialog
          open
          locations={LOCATIONS}
          defaultLocationId="location-a"
          onClose={vi.fn()}
          onReceived={vi.fn()}
        />
      </ThemeProvider>,
    );
  }

  async function receive(refusal: () => Response) {
    server.use(http.post('/api/v1/stock/movements', refusal));
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole('combobox', { name: 'Item' }));
    await user.click(await screen.findByRole('option', { name: /PLAIN-1/ }));
    await user.type(screen.getByRole('textbox', { name: 'Quantity' }), '5');
    await user.click(screen.getByRole('button', { name: 'Receive' }));
    return screen.findByRole('alert', { name: 'Error' });
  }

  it('as outdated: keeps what was typed, with Reload beside the refusal and the amber line above the title', async () => {
    deployed();

    const refusal = await receive(() => outdatedRefusal());
    expect(refusal).toHaveTextContent(OUTDATED);
    expect(
      within(refusal).getByRole('button', { name: 'Reload' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Quantity' })).toHaveValue('5');
    // The refusal made the new version urgent: the dialog says so too.
    expect(screen.getByRole('dialog')).toHaveTextContent(LINE);
  });

  it('as outdated before the new version is out: the 503’s words, then the refusal’s once it is', async () => {
    const refusal = await receive(() => outdatedRefusal());
    // A reload would load the same build, so it is not offered.
    expect(refusal).toHaveTextContent(INSTALLING);
    expect(within(refusal).queryByRole('button')).toBeNull();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(LINE);

    await outNow();
    expect(refusal).toHaveTextContent(OUTDATED);
    expect(
      within(refusal).getByRole('button', { name: 'Reload' }),
    ).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Quantity' })).toHaveValue('5');
  });

  it('with the API not yet deployed: the server’s words, nothing more', async () => {
    const refusal = await receive(() =>
      apiError(503, INSTALLING, 'api_updating'),
    );
    expect(refusal).toHaveTextContent(INSTALLING);
    expect(within(refusal).queryByRole('button')).toBeNull();
    expect(screen.getByRole('dialog')).not.toHaveTextContent(LINE);
  });
});

describe('a page’s read refused', () => {
  function open() {
    renderWithAuth(
      <MemoryRouter>
        <ProductsPage />
      </MemoryRouter>,
      { permissions: ['products.view'] },
    );
  }

  it('as outdated, with the new version out: the new version page where the page would be', async () => {
    deployed();
    server.use(http.get('/api/v1/products', () => outdatedRefusal()));
    open();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is ready',
      }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Products' })).toBeNull();
    expect(screen.queryByText(OUTDATED)).toBeNull();
  });

  it('as outdated before the new version is out: being installed, then the new version page once it is', async () => {
    server.use(http.get('/api/v1/products', () => outdatedRefusal()));
    open();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is being installed',
      }),
    ).toBeVisible();

    await outNow();
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is ready',
      }),
    ).toBeVisible();
  });

  it('with the API not yet deployed: being installed, and the page reads again by itself in a minute', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    server.use(
      http.get('/api/v1/products', () =>
        apiError(503, INSTALLING, 'api_updating'),
      ),
    );
    open();

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'A new version is being installed',
      }),
    ).toBeVisible();
    expect(
      screen.getByText('This page tries again by itself in a minute.'),
    ).toBeVisible();

    // The API has deployed.
    server.use(http.get('/api/v1/products', () => HttpResponse.json([])));
    act(() => vi.advanceTimersByTime(60_000));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Products' }),
    ).toBeVisible();
  });

  it('reads nothing while the tab is hidden, and again at once when it comes back', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    let reads = 0;
    server.use(
      http.get('/api/v1/products', () => {
        reads += 1;
        return apiError(503, INSTALLING, 'api_updating');
      }),
    );
    open();
    await screen.findByRole('heading', {
      level: 1,
      name: 'A new version is being installed',
    });
    expect(reads).toBe(1);

    const showTab = (state: DocumentVisibilityState) => {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    };
    showTab('hidden');
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(reads).toBe(1);

    showTab('visible');
    await vi.waitFor(() => expect(reads).toBe(2));
  });
});
