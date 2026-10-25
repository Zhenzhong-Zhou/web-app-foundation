import { useEffect, useState } from 'react';

/**
 * Whether a box that scrolls on its own holds more below what it shows:
 * the rail's links running under its pinned foot (ADR-082), which the foot
 * then says with a shadow, as nothing else would (a Mac hides scroll bars
 * until something scrolls). Asked again as the box scrolls, and as it or
 * its content changes size: a window made shorter, the rail folded, links
 * that arrive with the session.
 *
 * Callback refs, `scroller` for the box and `content` for what is in it,
 * so a drawer that mounts its links only while open is watched once it
 * does.
 */
export function useMoreBelow() {
  const [scroller, setScroller] = useState<HTMLElement | null>(null);
  const [content, setContent] = useState<HTMLElement | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!scroller) return;
    const ask = () =>
      setMore(
        scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1,
      );
    ask();
    scroller.addEventListener('scroll', ask, { passive: true });
    // Not in jsdom, as Help's panel finds; asked once there.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(ask);
    observer?.observe(scroller);
    if (content) observer?.observe(content);
    return () => {
      scroller.removeEventListener('scroll', ask);
      observer?.disconnect();
    };
  }, [scroller, content]);

  return { scroller: setScroller, content: setContent, more };
}
