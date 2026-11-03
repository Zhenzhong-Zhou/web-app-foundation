import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

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
          expiresAt: null,
          productId: null,
          coverFileId: null,
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
          expiresAt: null,
          productId: 'product-1',
          coverFileId: 'file-1',
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
    await user.click(await screen.findByText('Show all in Lots'));
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
    await user.click(await screen.findByText('Show all in Lots'));
    expect(screen.getByTestId('where').textContent).toBe(
      '/inventory?search=bf',
    );
  });

  // Close matches are the lookup's alone (ADR-056): their list finds none.
  it('offers Show all only for a group with a match that is not a close one', async () => {
    server.use(http.get('/api/v1/lookup', () => HttpResponse.json(ANSWER)));
    const user = userEvent.setup();
    renderBox();

    await user.type(await openLookup(user), 'bf');
    expect(await screen.findByText('Show all in Lots')).toBeTruthy();
    // Items' one result is a close match: shown, with no Show all (#311).
    expect(screen.getByText('Focus 60ct')).toBeTruthy();
    expect(screen.queryByText('Show all in Items')).toBeNull();
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
