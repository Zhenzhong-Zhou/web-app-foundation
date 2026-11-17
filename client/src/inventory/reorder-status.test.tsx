import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { LeftLine, ReorderStatusChip } from './reorder-status';

describe('ReorderStatusChip and LeftLine', () => {
  it('says the status in Home’s words, its icon only when asked', () => {
    renderWithAuth(
      <>
        <ReorderStatusChip status="low" />
        <ReorderStatusChip status="out" withIcon />
      </>,
    );

    expect(screen.getByText('Low')).toBeVisible();
    expect(screen.getByText('Out')).toBeVisible();
    expect(screen.getAllByTestId(/Icon$/)).toHaveLength(1);
  });

  it('links the line to Where it stands on a list, plain words on the item’s page', () => {
    renderWithAuth(
      <MemoryRouter>
        <LeftLine position="10.0000" reorderPoint="36.0000" productId="p-1" />
        <LeftLine position="-20.0000" reorderPoint="96.0000" />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: '10 left · reorder at 36' }),
    ).toHaveAttribute('href', '/items/p-1#stock');
    expect(screen.getByText('-20 left · reorder at 96')).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
