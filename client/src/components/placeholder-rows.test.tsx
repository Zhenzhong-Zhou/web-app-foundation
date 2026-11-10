import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@mui/material';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INDICATOR_DELAY_MS } from '../lib/use-delayed-flag';
import { PlaceholderRows } from './placeholder-rows';

afterEach(() => {
  vi.useRealTimers();
});

describe('PlaceholderRows', () => {
  it('draws its bars in the body past the wait, under the head, hidden from a screen reader', () => {
    vi.useFakeTimers();
    const { container } = render(
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Number</TableCell>
            <TableCell>Expected</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <PlaceholderRows columns={2} />
        </TableBody>
      </Table>,
    );

    // A quick answer never flashes them.
    expect(container.querySelector('.MuiSkeleton-root')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(INDICATOR_DELAY_MS);
    });

    const bars = container.querySelectorAll('tbody tr');
    expect(bars).toHaveLength(2);
    expect(bars[0].querySelector('td')).toHaveAttribute('colspan', '2');
    expect(bars[0]).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(
      screen.getByRole('columnheader', { name: 'Expected' }),
    ).toBeVisible();
  });
});
