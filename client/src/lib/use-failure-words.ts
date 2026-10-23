import { useNewVersion } from '../version/version-check';
import { messageFor } from './api';

/**
 * What a failure says, worded as the screen renders rather than when it
 * came (ADR-081). An outdated tab's refusal says a new version is being
 * installed while the version file still names this tab's build, and the
 * server's words once the new version is out: kept on screen, a refusal
 * worded when it came would go on saying "Try again in a minute" under the
 * amber banner's "reload". The screen renders again when what is known of
 * a new version changes.
 *
 * Words a screen wrote itself, a string, show as they are; nothing, null.
 * `wordsOf` for a screen with words of its own for some failures, as
 * sign-in has for too many attempts (authMessageFor).
 */
export function useFailureWords(
  failure: unknown,
  wordsOf: (caught: unknown) => string = messageFor,
): string | null {
  useNewVersion();
  if (failure === null || failure === undefined) return null;
  return typeof failure === 'string' ? failure : wordsOf(failure);
}
