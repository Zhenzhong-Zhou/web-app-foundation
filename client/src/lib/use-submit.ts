import { useState } from 'react';

import { useToast } from '../components/use-toast';
import { ApiError } from './api';
import { useFailureWords } from './use-failure-words';

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
 *
 * `error` is worded as the dialog renders, not when the refusal came: an
 * outdated tab's refusal says the new version is being installed until
 * the version file names it, and then what the server said (ADR-081). All
 * three come from the one failure kept.
 */
export function useSubmit<T = unknown>(
  onDone: () => void | Promise<void>,
  options: { success?: string | ((result: T) => string) } = {},
) {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const toast = useToast();
  const error = useFailureWords(failure);
  const refusal = failure instanceof ApiError ? failure : null;

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
      setFailure(caught);
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
    error,
    errorCode: refusal?.code ?? null,
    errorDetails: refusal?.details ?? null,
    reset,
    submit,
  };
}
