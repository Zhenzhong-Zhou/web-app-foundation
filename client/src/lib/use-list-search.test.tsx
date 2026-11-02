import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { OFFER_BACK } from './offer-back';
import { useListSearch } from './use-list-search';

function Probe() {
  const { text, setText } = useListSearch();
  const location = useLocation();

  return (
    <>
      <input
        aria-label="Search"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <p>search {location.search || 'none'}</p>
      <p>state {JSON.stringify(location.state)}</p>
    </>
  );
}

describe('useListSearch', () => {
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
