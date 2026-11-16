import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useOpenRows } from '../lib/use-open-rows';
import { OpeningButton } from './opening-button';

/** A row's places, as Stock opens them (ADR-093). */
function Places({ read }: { read: () => Promise<string[]> }) {
  const places = useOpenRows(read);

  return (
    <>
      <OpeningButton
        words="2 places"
        name={{
          show: 'Show where Vitamin C is',
          hide: 'Hide where Vitamin C is',
        }}
        open={places.open}
        busy={places.busy}
        controls="places"
        onClick={places.toggle}
      />
      {places.open && (
        <ul id="places">
          {places.rows?.map((place) => (
            <li key={place}>{place}</li>
          ))}
        </ul>
      )}
      {places.failure !== null && (
        <button onClick={places.retry}>Try again</button>
      )}
    </>
  );
}

/** A promise answered when the test says, and the answer it gives. */
function later() {
  let answer: (places: string[]) => void = () => undefined;
  const read = vi.fn(
    () =>
      new Promise<string[]>((resolve) => {
        answer = resolve;
      }),
  );
  return { read, answer: (places: string[]) => answer(places) };
}

/** The button that opens a row, WAI-ARIA's disclosure (ADR-093). */
describe('OpeningButton with useOpenRows', () => {
  afterEach(() => vi.useRealTimers());

  it('opens its rows below it, says so, and keeps focus while they read', async () => {
    render(<Places read={() => Promise.resolve(['Shelf A', 'Shelf B'])} />);

    const button = screen.getByRole('button', {
      name: 'Show where Vitamin C is',
    });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('2 places');

    button.focus();
    fireEvent.click(button);

    expect(await screen.findByText('Shelf B')).toBeVisible();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'places');
    expect(button).toHaveAccessibleName('Hide where Vitamin C is');
    expect(button).toHaveFocus();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Shelf B')).not.toBeInTheDocument();
  });

  // A quick answer never flashes it (#358).
  it('reads “Reading…” once its rows take past 250 ms, and its words again after', async () => {
    vi.useFakeTimers();
    const { read, answer } = later();
    render(<Places read={read} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(249));
    expect(button).toHaveTextContent('2 places');
    expect(button).not.toHaveAttribute('aria-busy');

    act(() => vi.advanceTimersByTime(1));
    expect(button).toHaveTextContent('Reading…');
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-expanded', 'true');

    await act(async () => answer(['Shelf A']));
    expect(button).toHaveTextContent('2 places');
    expect(screen.getByText('Shelf A')).toBeInTheDocument();
  });

  it('reads its rows again on Try again, and ignores an answer that comes after it closed', async () => {
    const read = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(['Shelf A']);
    render(<Places read={read} />);

    fireEvent.click(screen.getByRole('button', { name: /Show where/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Shelf A')).toBeVisible();
    expect(read).toHaveBeenCalledTimes(2);

    // Closed, then opened again before the first answer came.
    const first = later();
    const second = later();
    read.mockImplementationOnce(first.read).mockImplementationOnce(second.read);
    const button = screen.getByRole('button', { name: /Hide where/ });
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);

    await act(async () => first.answer(['Shelf B']));
    expect(screen.queryByText('Shelf B')).not.toBeInTheDocument();
    await act(async () => second.answer(['Shelf C']));
    expect(screen.getByText('Shelf C')).toBeVisible();
  });
});
