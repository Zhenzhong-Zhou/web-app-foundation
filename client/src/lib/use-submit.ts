import { useState } from 'react';

import { ApiError } from './api';

/**
 * The submit half of a dialog: in-flight state, one error string, and the
 * guarantee that the flag is always cleared.
 *
 * Extracted at four, after the same omission appeared in every one — close()
 * reset the form but not `submitting`, so a successful create left the button
 * reading "Adding…" until a reload. A finally in one place cannot drift.
 *
 * `onDone` runs only on success and outside the try, so a failing refetch does
 * not surface as an error about the thing that was just created successfully.
 */
export function useSubmit(onDone: () => void | Promise<void>) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Clears state when a dialog closes, so reopening starts clean. */
  function reset() {
    setError(null);
    setSubmitting(false);
  }

  async function submit(action: () => Promise<unknown>) {
    setSubmitting(true);
    setError(null);

    try {
      await action();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
      return;
    } finally {
      setSubmitting(false);
    }

    await onDone();
  }

  return { submitting, error, reset, submit };
}
