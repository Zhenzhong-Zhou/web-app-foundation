import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ErrorBoundary } from './error-boundary';

function Page({ broken }: { broken: boolean }) {
  if (broken) throw new Error('Broken page');
  return <p>Orders</p>;
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears when the person goes elsewhere, so a broken page can be left', () => {
    // React and the boundary both log the failure; neither is under test.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { rerender } = render(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders/1">
          <Page broken />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // The same address keeps the message: nothing has changed to fix it.
    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders/1">
          <Page broken={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <ErrorBoundary resetKey="/orders">
          <Page broken={false} />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    expect(screen.getByText('Orders')).toBeInTheDocument();
  });
});
