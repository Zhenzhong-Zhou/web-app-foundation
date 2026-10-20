import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { guideFor, type GuideName } from './guides';
import { HelpContext, type HelpState } from './help-context';

/** A guide asked for on the page the person is on. */
interface Chosen {
  guide: GuideName;
  section: string | null;
  /** Counts each request, so the same one twice still differs. */
  mark: number;
}

/**
 * Help's state for the signed-in frame (ADR-079): whether it is open, and
 * which guide it shows.
 *
 * The guide follows the page: the one for the address, at the section its
 * `#id` names when a guide's own link led there. A Learn more, or a guide
 * chosen from the panel's foot, shows another until the person moves to
 * another page, which then shows its own.
 */
export function HelpProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [seen, setSeen] = useState(location.pathname);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const takeFocusRef = useRef(false);
  const marks = useRef(0);
  /** What had focus when Help opened, and whether closing should go back. */
  const opener = useRef<HTMLElement | null>(null);
  const restore = useRef(false);

  // A new page: its own guide, whatever was chosen on the last.
  if (seen !== location.pathname) {
    setSeen(location.pathname);
    setChosen(null);
  }

  /**
   * Back to whatever opened Help: the button, or the Learn more pressed,
   * unless it has gone with the page, when the button. After the render
   * that closes it, so a phone's dialog has let go of focus first.
   */
  useEffect(() => {
    if (open || !restore.current) return;
    restore.current = false;
    const target = opener.current?.isConnected ? opener.current : null;
    (target ?? buttonRef.current)?.focus();
  }, [open]);

  const remember = () => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };

  const choose = (guide: GuideName, section: string | null) => {
    marks.current += 1;
    takeFocusRef.current = true;
    setChosen({ guide, section, mark: marks.current });
  };

  const hash = location.hash.slice(1);

  const state: HelpState = {
    open,
    guide: chosen?.guide ?? guideFor(location.pathname) ?? 'home',
    section: chosen ? chosen.section : hash || null,
    request: chosen ? `chosen-${chosen.mark}` : location.key,
    toggle: () => {
      if (open) {
        setOpen(false);
        return;
      }
      remember();
      takeFocusRef.current = true;
      // The page's own guide, whatever was chosen before it closed.
      setChosen(null);
      setOpen(true);
    },
    close: () => {
      restore.current = true;
      setOpen(false);
    },
    learnMore: ({ guide, section }) => {
      if (!open) remember();
      choose(guide, section);
      setOpen(true);
    },
    show: (guide) => choose(guide, null),
    follow: () => {
      takeFocusRef.current = true;
      setChosen(null);
    },
    takeFocusRef,
    buttonRef,
  };

  return <HelpContext.Provider value={state}>{children}</HelpContext.Provider>;
}
