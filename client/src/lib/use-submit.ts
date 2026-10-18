import { useState } from 'react';

import type { ErrorDetails } from '../api/types.gen';
import { useToast } from '../components/use-toast';
import { ApiError, messageFor } from './api';

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
 *
 * `success` is the confirmation toast. Here rather than in each dialog, for
 * the reason this hook exists: said once, it cannot be forgotten on the next
 * dialog, and it cannot fire for a save that failed. Given as a function,
 * it is written from what the action returned, such as the number an
 * invoice was issued as (ADR-073).
 *
 * `errorCode` is the refusal's code when the server gave one, read with
 * hasCode in lib/api.ts, for a dialog that can offer the way out, such as a
 * link to the setting that is missing. Set and cleared with `error`, as
 * `errorDetails` is, what a few codes carry beside it (ADR-073).
 */
export function useSubmit<T = unknown>(
  onDone: () => void | Promise<void>,
  options: { success?: string | ((result: T) => string) } = {},
) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<{
    message: string;
    code: string | null;
    details: ErrorDetails | null;
  } | null>(null);
  const toast = useToast();

  /** Clears state when a dialog closes, so reopening starts clean. */
  function reset() {
    setFailure(null);
    setSubmitting(false);
  }

  async function submit(action: () => Promise<T>) {
    setSubmitting(true);
    setFailure(null);

    let result: T;
    try {
      result = await action();
    } catch (caught) {
      const refusal = caught instanceof ApiError ? caught : null;
      setFailure({
        message: messageFor(caught),
        code: refusal?.code ?? null,
        details: refusal?.details ?? null,
      });
      return;
    } finally {
      setSubmitting(false);
    }

    const { success } = options;
    if (success) toast(typeof success === 'string' ? success : success(result));

    await onDone();
  }

  return {
    submitting,
    error: failure?.message ?? null,
    errorCode: failure?.code ?? null,
    errorDetails: failure?.details ?? null,
    reset,
    submit,
  };
}
