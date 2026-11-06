import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/**
 * The time now, changed on each minute by a timer (ADR-091): Home's date
 * and time move on by themselves, and never show seconds, which would
 * draw the eye with nothing to act on.
 */
export function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: number;
    function next() {
      const at = new Date();
      setNow(at);
      timer = window.setTimeout(next, MINUTE_MS - (at.getTime() % MINUTE_MS));
    }
    timer = window.setTimeout(next, MINUTE_MS - (Date.now() % MINUTE_MS));
    return () => window.clearTimeout(timer);
  }, []);

  return now;
}
