import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { LoadMoreButton } from './load-more-button';
import { ShowingLine } from './showing-line';

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

  // #638 (P1a): a list that counts its rows says so always, "31 codes"
  // once every row is shown, "Showing 50 of 312 codes" while there are
  // more; no count without a total while there are more.
  it('keeps its count line once there is no more, the button gone', () => {
    const { rerender } = render(
      <LoadMoreButton
        hasMore
        loading={false}
        pageSize={50}
        onLoadMore={vi.fn()}
        before={<ShowingLine shown={50} total={312} more of="code" />}
      />,
    );
    expect(screen.getByText('Showing 50 of 312 codes')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Show 50 more' })).toBeVisible();

    rerender(
      <LoadMoreButton
        hasMore={false}
        loading={false}
        pageSize={50}
        onLoadMore={vi.fn()}
        before={<ShowingLine shown={31} total={31} more={false} of="code" />}
      />,
    );
    expect(screen.getByText('31 codes')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(
      <LoadMoreButton
        hasMore
        loading={false}
        pageSize={50}
        onLoadMore={vi.fn()}
        before={<ShowingLine shown={50} total={null} more of="lot" />}
      />,
    );
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
  });
});
