import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { OFFER_BACK } from './offer-back';
import { useListSearch } from './use-list-search';

function Probe() {
  const { text, setText } = useListSearch();
  const location = useLocation();
  const navigation = useNavigationType();

  return (
    <>
      <input
        aria-label="Search"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p>search {location.search || 'none'}</p>
      <p>state {JSON.stringify(location.state)}</p>
      <p>navigation {navigation}</p>
    </>
  );
}

describe('useListSearch', () => {
  // Written as the list's filters and sort are (useAddressWrite): in
  // place, beside them, and gone once the box is emptied.
  it('writes the search in place, keeping the list’s other choices', async () => {
    render(
      <MemoryRouter
        initialEntries={['/orders?status=all&sort=total&order=asc']}
      >
        <Probe />
      </MemoryRouter>,
    );
    const box = screen.getByRole('textbox', { name: 'Search' });

    await userEvent.type(box, 'acme');
    expect(
      await screen.findByText(
        'search ?status=all&sort=total&order=asc&search=acme',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('navigation REPLACE')).toBeInTheDocument();

    await userEvent.clear(box);
    expect(
      await screen.findByText('search ?status=all&sort=total&order=asc'),
    ).toBeInTheDocument();
  });

  // Opened by a link that offered Back, a search keeps it (#341).
  it('keeps the state the page was opened with', async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: '/orders', state: OFFER_BACK }]}
      >
        <Probe />
      </MemoryRouter>,
    );

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Search' }),
      'acme',
    );

    expect(await screen.findByText('search ?search=acme')).toBeInTheDocument();
    expect(
      screen.getByText(`state ${JSON.stringify(OFFER_BACK)}`),
    ).toBeInTheDocument();
  });
});
