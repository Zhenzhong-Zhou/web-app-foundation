import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { HistoryLink } from './history-link';

function renderLink(permissions: string[]) {
  return renderWithAuth(
    <MemoryRouter>
      <HistoryLink resourceId="order-1" />
    </MemoryRouter>,
    { permissions },
  );
}

describe('HistoryLink', () => {
  it('links to the audit log filtered to this record', () => {
    renderLink(['audit.view']);

    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute(
      'href',
      '/audit?resourceId=order-1',
    );
  });

  // The audit page would refuse the request anyway; a link that leads to a
  // refusal is a control that does nothing.
  it('is absent without audit.view', () => {
    renderLink([]);

    expect(
      screen.queryByRole('link', { name: 'History' }),
    ).not.toBeInTheDocument();
  });
});
