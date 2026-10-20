import { useState } from 'react';

import { KEEP_SIGNED_IN } from '../lib/session-keys';

/**
 * Keep me signed in, at sign-in and on either invitation page, as this
 * browser last chose it (ADR-065): ticked unless it said otherwise. The
 * third item remembers the choice, once the sign-in it was for has worked.
 */
export function useKeepSignedIn() {
  const [keepSignedIn, setKeepSignedIn] = useState(
    () => window.localStorage.getItem(KEEP_SIGNED_IN) !== 'false',
  );
  const remember = () =>
    window.localStorage.setItem(KEEP_SIGNED_IN, String(keepSignedIn));
  return [keepSignedIn, setKeepSignedIn, remember] as const;
}
