import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { LookupResponse } from '../lib/types';
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
      await screen.findByText('Type at least two characters.'),
    ).toBeTruthy();

    await user.type(box, 'f');
    expect(await screen.findByText('Lots')).toBeTruthy();
    expect(screen.getByText('BF-2609')).toBeTruthy();
    expect(screen.getByText('Items')).toBeTruthy();
    // A typo's result says so.
    expect(screen.getByText('close match')).toBeTruthy();
    // One question for the whole word, never for one character.
    expect(asked).toEqual(['bf']);
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
    await user.click(await screen.findByText('Show all in Items'));
    expect(screen.getByTestId('where').textContent).toBe('/products?search=bf');
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
