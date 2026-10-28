import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { Partner } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { PartnersPage } from './partners-page';

function partner(name: string): Partner {
  return {
    id: name,
    name,
    code: null,
    taxId: null,
    salePriceListId: null,
    purchasePriceListId: null,
    documentLanguage: null,
    documentSecondLanguage: null,
    notes: null,
    isActive: true,
  };
}

function renderAt(address: string) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <PartnersPage />
    </MemoryRouter>,
    { permissions: ['partners.view'] },
  );
}

const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('link')
    .map((link) => link.textContent);

/**
 * Searched on the server (ADR-056, amended), as Products is: the page sends
 * what is typed and shows what comes back, in the order it comes.
 */
describe('PartnersPage', () => {
  it('asks with the address’s search, and lists the answer in its order', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/partners', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('search'));
        // The exact match first, then the one that has it inside, as the
        // server ranks them, and neither spelled as typed.
        return HttpResponse.json([
          partner('Pharmacie Saint-Laurent'),
          partner('Coopérative du Bas-Saint-Laurent'),
        ]);
      }),
    );

    renderAt('/partners?search=pharmacie%20saint%20laurent');

    expect(
      await screen.findByRole('link', { name: 'Pharmacie Saint-Laurent' }),
    ).toBeVisible();
    expect(asked).toEqual(['pharmacie saint laurent']);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue(
      'pharmacie saint laurent',
    );
    expect(names()).toEqual([
      'Pharmacie Saint-Laurent',
      'Coopérative du Bas-Saint-Laurent',
    ]);
  });

  it('asks again once typing stops, and drops an answer that comes after a newer one', async () => {
    const user = userEvent.setup();
    let answerFirst: () => void = () => undefined;
    const firstAnswered = new Promise<void>((resolve) => {
      answerFirst = resolve;
    });
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/partners', async ({ request }) => {
        const search = new URL(request.url).searchParams.get('search');
        asked.push(search);
        if (search === 'md') {
          await firstAnswered;
          return HttpResponse.json([partner('Medline')]);
        }
        return HttpResponse.json(
          search === 'mdyf'
            ? [partner('明德药房')]
            : [partner('Old Mill Herbs')],
        );
      }),
    );

    renderAt('/partners');
    await screen.findByRole('link', { name: 'Old Mill Herbs' });

    const box = screen.getByRole('searchbox', { name: 'Search' });
    await user.type(box, 'md');
    await expect.poll(() => asked).toEqual([null, 'md']);
    await user.type(box, 'yf');

    expect(await screen.findByRole('link', { name: '明德药房' })).toBeVisible();
    expect(asked).toEqual([null, 'md', 'mdyf']);

    answerFirst();
    // Every chance for the late answer to land before checking it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(names()).toEqual(['明德药房']);
  });

  it('says nothing matches for an empty answer to a search', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/partners', ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.has('search')
            ? []
            : [partner('Old Mill Herbs')],
        ),
      ),
    );

    renderAt('/partners');
    await screen.findByRole('link', { name: 'Old Mill Herbs' });

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '药');
    expect(
      await screen.findByText('Nothing matches that search.'),
    ).toBeVisible();
  });
});
