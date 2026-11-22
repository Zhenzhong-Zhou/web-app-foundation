import { fireEvent, render, screen } from '@testing-library/react';
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
          productId: 'product-1',
          coverFileId: 'file-1',
          type: 'good',
          close: true,
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
    // A typo's result says so.
    expect(screen.getByText('close match')).toBeTruthy();
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

  // Close matches are the lookup's alone (ADR-056): their list finds none.
  it('offers Show all only for a group with a match that is not a close one', async () => {
    server.use(http.get('/api/v1/lookup', () => HttpResponse.json(ANSWER)));
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'bf');
    expect(await screen.findByText('Show all in Inventory')).toBeTruthy();
    // Items' one result is a close match: shown, with no Show all (#311).
    expect(screen.getByText('Focus 60ct')).toBeTruthy();
    expect(screen.queryByText('Show all in Items')).toBeNull();
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
