import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { ToItems } from './to-items';

function Where() {
  const { pathname, search, hash } = useLocation();
  return <p>{`${pathname}${search}${hash}`}</p>;
}

const openAt = (at: string) =>
  render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route path="/products/*" element={<ToItems />} />
        <Route path="/items/*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );

describe('ToItems', () => {
  it('sends /products to /items with its query', async () => {
    openAt('/products?search=calm');

    expect(await screen.findByText('/items?search=calm')).toBeInTheDocument();
  });

  it('sends an item’s old address to its new one', async () => {
    openAt('/products/product-1?tab=history#names');

    expect(
      await screen.findByText('/items/product-1?tab=history#names'),
    ).toBeInTheDocument();
  });
});
