import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { LookupResponse } from '../api/types.gen';
import { PageHeader } from '../components/page-header';
import { server } from '../test/setup';
import { TestProviders } from '../test/test-providers';
import { LookupBox } from './lookup-box';

const ANSWER: LookupResponse = {
  groups: [
    {
      kind: 'lot',
      results: [
        {
          id: 'lot-1',
          title: 'BF-2609',
          detail: 'FOCUS-60',
          status: null,
          direction: null,
          fulfillment: null,
          expiresAt: null,
          expiry: 'none',
          supplierLot: null,
          isAssigned: false,
          formerCode: null,
          productId: null,
          coverFileId: null,
          type: null,
          close: false,
        },
      ],
    },
    {
      kind: 'item',
      results: [
        {
          id: 'variant-1',
          title: 'Focus 60ct',
          detail: 'FOCUS-60',
          status: null,
          direction: null,
          fulfillment: null,
          expiresAt: null,
          expiry: null,
          supplierLot: null,
          isAssigned: null,
          formerCode: null,
          productId: 'product-1',
          coverFileId: 'file-1',
          type: 'good',
          close: false,
        },
      ],
    },
  ],
};

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderBox() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <LookupBox />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
    { wrapper: TestProviders },
  );
}

/** Opens the lookup: in jsdom no media query matches, so the phone form. */
async function openLookup(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole('button', { name: 'Search everything' }),
  );
  return screen.findByRole('combobox', { name: 'Search everything' });
}

describe('LookupBox', () => {
  it('asks after two characters, and shows results by kind', async () => {
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/lookup', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('q') ?? '');
        return HttpResponse.json(ANSWER);
      }),
    );
    const user = userEvent.setup();
    renderBox();

    const box = await openLookup(user);
    await user.type(box, 'b');
    expect(
      await screen.findByText(
        'Type at least two characters, or one Chinese character.',
      ),
    ).toBeTruthy();

    await user.type(box, 'f');
    expect(await screen.findByText('Lots')).toBeTruthy();
    // An item shows its product's cover (ADR-066); a lot shows none.
    expect(
      (await screen.findByRole('img', { name: 'Focus 60ct' })).getAttribute(
        'src',
      ),
    ).toBe('/api/v1/files/file-1?size=thumb');
    expect(screen.getByText('BF-2609')).toBeTruthy();
    expect(screen.getByText('Items')).toBeTruthy();
    // One question for the whole word, never for one character.
    expect(asked).toEqual(['bf']);
  });

  // #546 and #548: an item with no cover shows its type's icon, as Items
  // does, and its type as a word beside its code; a lot neither.
  it('shows an item’s type by its icon and its word', async () => {
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            ANSWER.groups[0],
            {
              kind: 'item',
              results: [
                {
                  id: 'variant-2',
                  title: 'Focus blend',
                  detail: 'FOCUS-BLEND',
                  status: null,
                  direction: null,
                  fulfillment: null,
                  expiresAt: null,
                  expiry: null,
                  supplierLot: null,
                  isAssigned: null,
                  formerCode: null,
                  productId: 'product-2',
                  coverFileId: null,
                  type: 'material',
                  close: false,
                },
              ],
            },
          ],
        } satisfies LookupResponse),
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'focus');

    const blend = await screen.findByRole('option', { name: /Focus blend/ });
    expect(
      blend.querySelector('[data-testid="GrainOutlinedIcon"]'),
    ).not.toBeNull();
    expect(blend).toHaveTextContent('FOCUS-BLEND · Raw material');
    const lot = screen.getByRole('option', { name: /BF-2609/ });
    expect(lot).toHaveTextContent(/^BF-2609FOCUS-60$/);
  });

  // #618: a lot's row read "MAGCAP-60Oct 7, 2028", its item's code run
  // into its date. Each part now has its label and a dot between, and a
  // lot says what is still to add (ADR-094, R5 and R9).
  it('reads a lot’s item code, then its expiry or its mark, each labelled, and its supplier’s lot', async () => {
    const lot = (
      title: string,
      over: Partial<LookupResponse['groups'][number]['results'][number]>,
    ) => ({
      ...ANSWER.groups[0].results[0],
      id: title,
      title,
      ...over,
    });
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            {
              kind: 'lot',
              results: [
                lot('LOT-DATED', { expiresAt: '2099-01-01', expiry: 'date' }),
                lot('LOT-UNKNOWN', {
                  expiry: 'unknown',
                  supplierLot: 'Hx-2609',
                  isAssigned: true,
                }),
                lot('LOT-PAST', {
                  expiresAt: '2020-01-01',
                  expiry: 'date',
                  isAssigned: true,
                }),
                lot('LOT-NONE', {}),
              ],
            },
          ],
        } satisfies LookupResponse),
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'lot');

    const row = (title: string) =>
      screen.findByRole('option', { name: new RegExp(`^${title}`) });
    expect(await row('LOT-DATED')).toHaveTextContent(
      /^LOT-DATEDFOCUS-60 · Expires Jan 1, 2099$/,
    );
    expect(await row('LOT-UNKNOWN')).toHaveTextContent(
      /^LOT-UNKNOWNFOCUS-60 · Expiry to add · Supplier’s lot Hx-2609$/,
    );
    // Near or past, the chip says how near, its date beside it.
    expect(await row('LOT-PAST')).toHaveTextContent(
      /^LOT-PASTFOCUS-60 · Expired [\d,]+ days agoJan 1, 2020 · Supplier’s lot to add$/,
    );
    expect(await row('LOT-NONE')).toHaveTextContent(/^LOT-NONEFOCUS-60$/);
  });

  it('asks for one Chinese character alone', async () => {
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/lookup', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('q') ?? '');
        return HttpResponse.json(ANSWER);
      }),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), '鱼');
    expect(await screen.findByText('Lots')).toBeTruthy();
    expect(asked).toEqual(['鱼']);
  });

  // A top-level page, which offers Back to where it was typed (#341).
  it('opens Show all’s list with Back', async () => {
    server.use(http.get('/api/v1/lookup', () => HttpResponse.json(ANSWER)));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/orders/order-1']}>
        <LookupBox />
        <Routes>
          <Route path="/orders/:id" element={<p>The order</p>} />
          <Route
            path="*"
            element={<PageHeader crumbs={[]} title="A top-level page" />}
          />
        </Routes>
      </MemoryRouter>,
      { wrapper: TestProviders },
    );

    await user.type(await openLookup(user), 'bf');
    await user.click(await screen.findByText('Show all in Inventory'));
    // Once the lookup's dialog has closed, unhiding the page.
    await user.click(await screen.findByRole('button', { name: 'Back' }));

    expect(screen.getByText('The order')).toBeVisible();
  });

  it('opens a result, and "Show all" opens its list already narrowed', async () => {
    server.use(http.get('/api/v1/lookup', () => HttpResponse.json(ANSWER)));
    const user = userEvent.setup();
    renderBox();

    let box = await openLookup(user);
    await user.type(box, 'bf');
    await user.click(await screen.findByText('BF-2609'));
    expect(screen.getByTestId('where').textContent).toBe('/lots/lot-1');

    box = await openLookup(user);
    await user.type(box, 'bf');
    // Named after the page it opens, Inventory, not the group (#149).
    await user.click(await screen.findByText('Show all in Inventory'));
    expect(screen.getByTestId('where').textContent).toBe(
      '/inventory?group=lot&search=bf',
    );
  });

  // A run's opens Production, as the menu names the page, not the group.
  it('names a production run’s Show all after Production', async () => {
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            {
              kind: 'productionRun',
              results: [{ ...ANSWER.groups[0].results[0], id: 'run-1' }],
            },
          ],
        } satisfies LookupResponse),
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'bf');
    await user.click(await screen.findByText('Show all in Production'));
    expect(screen.getByTestId('where').textContent).toBe(
      '/production?search=bf',
    );
  });

  /** One result of the kind given, as the server answers it. */
  const found = (
    title: string,
    over: Partial<LookupResponse['groups'][number]['results'][number]> = {},
  ) => ({ ...ANSWER.groups[0].results[0], id: title, title, ...over });

  // #654: a whole code typed brought its record among a heap of close
  // matches, each marked "close match", that were not close at all.
  it('shows only what matches as typed when anything does', async () => {
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            {
              kind: 'order',
              results: [found('SO-000100', { close: true })],
            },
            {
              kind: 'lot',
              results: [
                found('MCS-001'),
                found('MCS-0019', { close: true }),
                found('MCS-010', { close: true }),
              ],
            },
          ],
        } satisfies LookupResponse),
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'MCS-001');

    expect(
      (await screen.findAllByRole('option')).map((row) => row.textContent),
    ).toEqual(['MCS-001FOCUS-60', 'Show all in Inventory']);
    expect(screen.getByText('Lots')).toBeTruthy();
    expect(screen.queryByText('Orders')).toBeNull();
    expect(screen.queryByText('Close matches')).toBeNull();
  });

  // #654 and #311: nothing matches as typed, so the close ones show, under
  // one heading; each row says its kind, since no heading names it, and
  // none offers Show all, as a list opened for a close match finds none.
  it('shows the close matches under one heading only when nothing matches as typed, each saying its kind, with no Show all', async () => {
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            {
              kind: 'order',
              results: [found('SO-000100', { close: true })],
            },
            {
              kind: 'lot',
              results: [
                found('MCS-001', { close: true }),
                found('MCS-010', { close: true }),
              ],
            },
          ],
        } satisfies LookupResponse),
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'MCS-0O1');

    const group = (await screen.findByText('Close matches')).closest('li');
    expect(screen.getAllByText('Close matches')).toHaveLength(1);
    expect(
      within(group as HTMLElement)
        .getAllByRole('option')
        .map((row) => row.textContent),
    ).toEqual([
      'SO-000100 · OrderFOCUS-60',
      'MCS-001 · LotFOCUS-60',
      'MCS-010 · LotFOCUS-60',
    ]);
    expect(screen.queryByText('Lots')).toBeNull();
    expect(screen.queryByText(/^Show all/)).toBeNull();
    expect(screen.queryByText(/close match/)).toBeNull();
  });

  // ADR-094 amended, R9: a former code typed whole is an exact match, so
  // its lot is among what matches as typed, saying what it was called.
  it('says the former code a lot was found by beside its code', async () => {
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            {
              kind: 'lot',
              results: [
                found('ASH-0601', { formerCode: 'ASH-06O1' }),
                found('ASH-0601-B'),
              ],
            },
          ],
        } satisfies LookupResponse),
      ),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'ASH-06O1');

    expect(
      await screen.findByRole('option', { name: /^ASH-0601 ·/ }),
    ).toHaveTextContent(/^ASH-0601 · was ASH-06O1FOCUS-60$/);
    // A lot found by its code today says nothing of a code it had.
    expect(
      screen.getByRole('option', { name: /^ASH-0601-B/ }),
    ).toHaveTextContent(/^ASH-0601-BFOCUS-60$/);
  });

  // #618: the list stopped at its edge with no sign of more. jsdom lays
  // nothing out, so the list's edge is 200 px down and each row 48 px tall.
  it('says how many rows are below a list cut at its edge, counting again as it scrolls', async () => {
    server.use(
      http.get('/api/v1/lookup', () =>
        HttpResponse.json({
          groups: [
            {
              kind: 'lot',
              results: ['L-1', 'L-2', 'L-3', 'L-4', 'L-5'].map((code) =>
                found(code),
              ),
            },
            ANSWER.groups[1],
          ],
        } satisfies LookupResponse),
      ),
    );
    let scrolled = 0;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (this.getAttribute('role') === 'listbox') {
          return new DOMRect(0, 0, 390, 200);
        }
        if (this.getAttribute('role') === 'option') {
          const rows = [...document.querySelectorAll('[role="option"]')];
          return new DOMRect(0, rows.indexOf(this) * 48 - scrolled, 390, 48);
        }
        return new DOMRect(0, 0, 0, 0);
      },
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'L-');

    // Eight rows: five lots and Show all, an item and Show all. Four fit.
    expect(
      await screen.findByText(
        '4 more below · scroll, or keep typing to narrow',
      ),
    ).toBeInTheDocument();

    scrolled = 96;
    fireEvent.scroll(screen.getByRole('listbox'));
    expect(
      await screen.findByText(
        '2 more below · scroll, or keep typing to narrow',
      ),
    ).toBeInTheDocument();

    // The last row in view: nothing is below, and the line goes.
    scrolled = 8 * 48 - 200;
    fireEvent.scroll(screen.getByRole('listbox'));
    await waitFor(() =>
      expect(screen.queryByText(/more below/)).not.toBeInTheDocument(),
    );
  });

  it('fills the full-screen search with its list, under the field (#312)', async () => {
    server.use(http.get('/api/v1/lookup', () => HttpResponse.json(ANSWER)));
    // jsdom lays nothing out: the field and its gutter end 72 px down.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 390, 72),
    );
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'bf');
    // Not MUI's 40% of the screen, which hid the last group's Show all.
    expect(await screen.findByRole('listbox')).toHaveStyle({
      maxHeight: 'calc(100dvh - 72px)',
    });
  });

  it('opens on ⌘K, and ignores a key event with no key', async () => {
    renderBox();
    await screen.findByRole('button', { name: 'Search everything' });

    // Chrome's autofill sends a keydown with no key at all. A listener
    // that throws is reported to the window, not to the dispatcher.
    const thrown: unknown[] = [];
    const onError = (event: ErrorEvent) => thrown.push(event.error);
    window.addEventListener('error', onError);
    window.dispatchEvent(new Event('keydown'));
    window.removeEventListener('error', onError);
    expect(thrown).toEqual([]);
    expect(
      screen.queryByRole('combobox', { name: 'Search everything' }),
    ).toBeNull();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(
      await screen.findByRole('combobox', { name: 'Search everything' }),
    ).toBeInTheDocument();
  });

  it('says when nothing is found', async () => {
    server.use(
      http.get('/api/v1/lookup', () => HttpResponse.json({ groups: [] })),
    );
    const user = userEvent.setup();
    renderBox();

    const box = await openLookup(user);
    await user.type(box, 'zzz');
    expect(await screen.findByText('Nothing found.')).toBeTruthy();
  });
});
