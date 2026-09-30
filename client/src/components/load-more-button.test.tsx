import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoadMoreButton } from './load-more-button';

describe('LoadMoreButton', () => {
  it('asks for the next page', async () => {
    const onLoadMore = vi.fn();
    render(<LoadMoreButton hasMore loading={false} onLoadMore={onLoadMore} />);

    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('says it is loading, and cannot be pressed twice meanwhile', () => {
    render(<LoadMoreButton hasMore loading onLoadMore={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
  });

  it('is not there once the server says there is no more', () => {
    render(
      <LoadMoreButton hasMore={false} loading={false} onLoadMore={vi.fn()} />,
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
