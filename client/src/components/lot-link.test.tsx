import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { offersBack } from '../lib/offer-back';
import { LotLink } from './lot-link';

function Trace() {
  const { state } = useLocation();
  return <p>{offersBack(state) ? 'the trace, with Back' : 'the trace'}</p>;
}

/** A lot's code opens its trace wherever it appears (ADR-093). */
describe('LotLink', () => {
  it('opens the lot’s trace, which offers Back', async () => {
    render(
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route
            path="/inventory"
            element={<LotLink id="lot-1" code="NN-2410-07" />}
          />
          <Route path="/lots/:id" element={<Trace />} />
        </Routes>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'NN-2410-07' });
    expect(link).toHaveAttribute('href', '/lots/lot-1');
    // Kept whole, and as typed when a browser translates the page (#245).
    expect(link.firstElementChild).toHaveAttribute('translate', 'no');

    await userEvent.click(link);
    expect(screen.getByText('the trace, with Back')).toBeVisible();
  });
});
