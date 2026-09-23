import { act, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { ToastProvider } from './toast-provider';

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('toast', () => {
  it('confirms a save that succeeded', async () => {
    const { result } = renderHook(
      () => useSubmit(() => undefined, { success: 'Run planned' }),
      { wrapper },
    );

    await act(() => result.current.submit(() => Promise.resolve()));

    expect(await screen.findByRole('status')).toHaveTextContent('Run planned');
  });

  // A failure stays in the dialog, next to what caused it.
  it('says nothing for a save that failed', async () => {
    const { result } = renderHook(
      () => useSubmit(() => undefined, { success: 'Run planned' }),
      { wrapper },
    );

    await act(() =>
      result.current.submit(() => Promise.reject(new ApiError('Nope', 409))),
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(result.current.error).toBe('Nope');
  });

  // Confirmation is a courtesy; its absence must not break the action.
  it('works without a provider', async () => {
    let done = false;
    const { result } = renderHook(() =>
      useSubmit(
        () => {
          done = true;
        },
        { success: 'Saved' },
      ),
    );

    await act(() => result.current.submit(() => Promise.resolve()));

    expect(done).toBe(true);
  });
});
