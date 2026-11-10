import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Link,
  MemoryRouter,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { OFFER_BACK } from './offer-back';
import {
  day,
  flag,
  id,
  oneOf,
  useAddressWrite,
  useListFilters,
} from './use-list-filters';
import { useListSort } from './use-list-sort';

const FILTERS = {
  status: oneOf(['', 'low', 'out'], ''),
  late: flag,
  from: day,
  to: day,
  locationId: id,
};

function Probe() {
  const [filters, setFilters] = useListFilters(FILTERS);
  const { sort, header } = useListSort(
    ['expiry', 'total'],
    filters.late ? { key: 'expiry', order: 'asc' } : null,
  );
  const location = useLocation();
  const navigation = useNavigationType();

  return (
    <>
      <p>values {JSON.stringify(filters)}</p>
      <p>sort {sort ? `${sort.key} ${sort.order}` : 'none'}</p>
      <p>address {location.search || 'none'}</p>
      <p>state {JSON.stringify(location.state)}</p>
      <p>navigation {navigation}</p>
      <button onClick={() => setFilters({ status: 'low' })}>Low</button>
      <button onClick={() => setFilters({ status: '' })}>All</button>
      <button onClick={() => setFilters({ late: true })}>Late</button>
      <button
        onClick={() => setFilters({ from: '2026-11-01', to: '2026-11-30' })}
      >
        November
      </button>
      <button onClick={header('expiry').onSort}>Expires</button>
      <Link to="/list?status=out">Out from elsewhere</Link>
    </>
  );
}

function open(address: string, state: unknown = null) {
  const [pathname, search = ''] = address.split('?');
  render(
    <MemoryRouter
      initialEntries={[{ pathname, search: search && `?${search}`, state }]}
    >
      <Probe />
    </MemoryRouter>,
  );
}

const press = (name: string) =>
  userEvent.click(screen.getByRole('button', { name }));

describe('useListFilters', () => {
  it('reads each filter from the address', () => {
    open(
      '/list?status=low&late=1&from=2026-11-01&locationId=0b4c3d6e-1f2a-4b5c-8d9e-0a1b2c3d4e5f',
    );

    expect(
      screen.getByText(
        `values ${JSON.stringify({
          status: 'low',
          late: true,
          from: '2026-11-01',
          locationId: '0b4c3d6e-1f2a-4b5c-8d9e-0a1b2c3d4e5f',
        })}`,
      ),
    ).toBeInTheDocument();
  });

  it('ignores a value the list does not know, as if left out', () => {
    open(
      '/list?status=nonsense&late=yes&from=2026-02-30&to=30/11/2026&locationId=abc',
    );

    expect(
      screen.getByText(
        `values ${JSON.stringify({ status: '', late: false, locationId: '' })}`,
      ),
    ).toBeInTheDocument();
  });

  // #302: a link to the list followed while it is open lands on what it
  // names, not on what was pressed before.
  it('follows the address while the list is open', async () => {
    open('/list');

    await press('Low');
    await userEvent.click(
      screen.getByRole('link', { name: 'Out from elsewhere' }),
    );

    expect(screen.getByText(/"status":"out"/)).toBeInTheDocument();
  });

  it('writes what is pressed in place, the default left out', async () => {
    open('/list?search=acme');

    await press('Low');
    expect(
      screen.getByText('address ?search=acme&status=low'),
    ).toBeInTheDocument();
    expect(screen.getByText('navigation REPLACE')).toBeInTheDocument();

    await press('All');
    expect(screen.getByText('address ?search=acme')).toBeInTheDocument();
  });

  it('writes several filters at once', async () => {
    open('/list');

    await press('November');

    expect(
      screen.getByText('address ?from=2026-11-01&to=2026-11-30'),
    ).toBeInTheDocument();
  });

  // Opened by a link that offered Back, a filter keeps it (#341).
  it('keeps the state the page was opened with', async () => {
    open('/list', OFFER_BACK);

    await press('Low');

    expect(
      screen.getByText(`state ${JSON.stringify(OFFER_BACK)}`),
    ).toBeInTheDocument();
  });
});

describe('useAddressWrite', () => {
  // The search and the tab write from an effect that depends on it, which
  // a new function each render would start again on every render.
  it('is the same function until the address changes', () => {
    const { result, rerender } = renderHook(() => useAddressWrite(), {
      wrapper: ({ children }) => (
        <MemoryRouter initialEntries={['/list?status=low']}>
          {children}
        </MemoryRouter>
      ),
    });
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});

describe('useListSort', () => {
  it('reads the sort from the address', () => {
    open('/list?sort=total&order=desc');
    expect(screen.getByText('sort total desc')).toBeInTheDocument();
  });

  it('ignores a column or an order the list does not know', () => {
    open('/list?sort=price&order=desc');
    expect(screen.getByText('sort none')).toBeInTheDocument();
  });

  it('writes the header chosen, then turns it round', async () => {
    open('/list');

    await press('Expires');
    expect(
      screen.getByText('address ?sort=expiry&order=asc'),
    ).toBeInTheDocument();

    await press('Expires');
    expect(
      screen.getByText('address ?sort=expiry&order=desc'),
    ).toBeInTheDocument();
  });

  // A filter's own order shows until a header is chosen (ADR-091).
  it('starts from the filter’s own order', async () => {
    open('/list');

    await press('Late');
    expect(screen.getByText('sort expiry asc')).toBeInTheDocument();
    expect(screen.getByText('address ?late=1')).toBeInTheDocument();

    await press('Expires');
    expect(screen.getByText('sort expiry desc')).toBeInTheDocument();
  });
});
