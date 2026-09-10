import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api';
import { useSubmit } from './use-submit';

/**
 * The hook exists because the same omission appeared in four dialogs: close()
 * reset the form but not `submitting`, so a successful create left the button
 * reading "Adding…" until a reload. These tests are what keep that fixed —
 * the bug is invisible in e2e, where the dialog closes anyway.
 */
describe('useSubmit', () => {
  it('clears submitting on success', async () => {
    const { result } = renderHook(() => useSubmit(vi.fn()));

    await act(async () => {
      await result.current.submit(() => Promise.resolve());
    });

    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('clears submitting on failure', async () => {
    const { result } = renderHook(() => useSubmit(vi.fn()));

    await act(async () => {
      await result.current.submit(() =>
        Promise.reject(new ApiError('Nope', 409)),
      );
    });

    // The finally. Without it a failed create leaves the button disabled and
    // reading "Adding…" with no way back except a reload.
    expect(result.current.submitting).toBe(false);
    expect(result.current.error).toBe('Nope');
  });

  it('reports an ApiError message and hides anything else', async () => {
    const { result } = renderHook(() => useSubmit(vi.fn()));

    await act(async () => {
      await result.current.submit(() =>
        Promise.reject(new TypeError('fetch failed')),
      );
    });

    /**
     * A network error is not a message anyone can act on, and its text leaks
     * implementation. An ApiError carries what the server chose to say, which
     * is written for a person.
     */
    expect(result.current.error).toBe('Could not reach the server.');
  });

  it('does not run onDone when the action fails', async () => {
    const onDone = vi.fn();
    const { result } = renderHook(() => useSubmit(onDone));

    await act(async () => {
      await result.current.submit(() =>
        Promise.reject(new ApiError('Nope', 409)),
      );
    });

    expect(onDone).not.toHaveBeenCalled();
  });

  it('does not surface a failing onDone as a submit error', async () => {
    const { result } = renderHook(() =>
      useSubmit(() => Promise.reject(new ApiError('Refetch died', 500))),
    );

    /**
     * onDone runs outside the try deliberately: it is the refetch after a
     * successful create, and reporting its failure would tell someone their
     * product was not created when it was.
     */
    await act(async () => {
      await result.current
        .submit(() => Promise.resolve())
        .catch(() => undefined);
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it('clears state on reset so reopening starts clean', async () => {
    const { result } = renderHook(() => useSubmit(vi.fn()));

    await act(async () => {
      await result.current.submit(() =>
        Promise.reject(new ApiError('Nope', 409)),
      );
    });

    expect(result.current.error).toBe('Nope');

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.submitting).toBe(false);
  });
});
