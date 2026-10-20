import { createContext, type RefObject } from 'react';

import type { GuideName, LearnMoreTarget } from './guides';

export interface HelpState {
  open: boolean;
  /** The guide shown: the page's, unless one was asked for on this page. */
  guide: GuideName;
  /** The section asked for, by a Learn more or a guide's link, if any. */
  section: string | null;
  /**
   * Changes each time a guide or a section is asked for, so asking for the
   * same section again scrolls to it and marks it again.
   */
  request: string;
  /** The Help button: opens the page's guide, or closes Help. */
  toggle: () => void;
  /** Close or Esc, which return focus to whatever opened Help. */
  close: () => void;
  /** Opens Help at a guide's section, from wherever the page offers it. */
  learnMore: (target: LearnMoreTarget) => void;
  /** Shows a guide without leaving the page: the list at the panel's foot. */
  show: (guide: GuideName) => void;
  /** A link in a guide was followed: the page it opens shows its own guide. */
  follow: () => void;
  /**
   * Whether the next guide or section shown takes focus, because the person
   * asked for it in Help or by a Learn more; a page they moved to on their
   * own leaves focus where they are.
   */
  takeFocusRef: RefObject<boolean>;
  /** The top bar's Help button, where focus goes when Help closes. */
  buttonRef: RefObject<HTMLButtonElement | null>;
}

/** In a module of its own, as AuthContext is, so Fast Refresh keeps state. */
export const HelpContext = createContext<HelpState | null>(null);
