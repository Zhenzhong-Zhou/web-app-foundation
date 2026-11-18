import type { FocusEvent } from 'react';

/**
 * A table's box scrolls a control that takes focus wholly into view. A
 * browser scrolls a focused control into its box only when it is wholly
 * out of it: one half past the edge stays half cut, as Stock's "Expires
 * first" did beside Help at 1280 × 800 (help.spec, CI's fonts). The
 * nearest edge, so a control already whole moves nothing.
 */
export function wholeOnFocus(event: FocusEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  // jsdom has no scrollIntoView.
  target.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}
