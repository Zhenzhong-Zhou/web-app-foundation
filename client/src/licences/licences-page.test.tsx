import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ProductLicence } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { LicencesPage } from './licences-page';

const GONE: ProductLicence = {
  id: 'licence-1',
  number: '300456',
  authority: 'Health Canada site licence',
  isActive: true,
  issuedAt: '2023-10-26',
  expiresAt: '2026-10-26',
  notes: null,
};

/** The list's reads, each one's query kept. */
function answer(licences: ProductLicence[] = [GONE]) {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get('/api/v1/product-licences', ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json(licences);
    }),
  );
  return asked;
}

function renderAt(address: string) {
  renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <LicencesPage />
    </MemoryRouter>,
    { permissions: ['product_licences.view'] },
  );
}

/**
 * Licences' filters (ADR-091, #460): Home's tile opens Licences expiring, its
 * late button Expired too, both in the address, which the server decides
 * by the organization's today.
 */
describe('LicencesPage', () => {
  it('opens on Licences expiring and Expired as Home asks, each cleared alone', async () => {
    const user = userEvent.setup();
    const asked = answer();
    renderAt('/licences?expiring=1&expired=1');

    expect(await screen.findByText('300456')).toBeVisible();
    expect(Object.fromEntries(asked[0])).toEqual({
      expiring: 'true',
      expired: 'true',
    });
    const expiring = screen.getByRole('button', { name: 'Licences expiring' });
    expect(expiring).toHaveAttribute('aria-pressed', 'true');

    // Expired cleared: every licence expiring soon.
    const chip = screen.getByRole('button', { name: 'Expired' });
    chip.focus();
    await user.keyboard('{Delete}');
    expect(
      screen.queryByRole('button', { name: 'Expired' }),
    ).not.toBeInTheDocument();
    await expect
      .poll(() => Object.fromEntries(asked.at(-1)!))
      .toEqual({ expiring: 'true' });

    // Licences expiring off: every licence.
    await user.click(expiring);
    await expect.poll(() => asked.at(-1)?.toString()).toBe('');
    expect(expiring).toHaveAttribute('aria-pressed', 'false');
  });

  it('says that nothing matches a filter, never that there are no licences', async () => {
    answer([]);
    renderAt('/licences?expired=1');

    expect(await screen.findByText('No licence has expired.')).toBeVisible();
    expect(screen.queryByText(/No licences yet/)).not.toBeInTheDocument();
  });

  it('asks for every licence with neither filter', async () => {
    const asked = answer();
    renderAt('/licences');

    expect(await screen.findByText('300456')).toBeVisible();
    expect(asked[0].toString()).toBe('');
    expect(
      screen.getByRole('button', { name: 'Licences expiring' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });
});
