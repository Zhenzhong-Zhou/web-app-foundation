import { useContext } from 'react';

import { HelpContext, type HelpState } from './help-context';

/**
 * Help, inside the signed-in frame; null outside it, where a Learn more has
 * nothing to open and draws nothing (ADR-079: the signed-out pages have no
 * Help).
 */
export function useHelp(): HelpState | null {
  return useContext(HelpContext);
}
