import { useEffect, useRef, useState } from 'react';

import type { LookupGroup, LookupResponse } from '../api/types.gen';
import { api } from '../lib/api';
import { lookupLongEnough } from './lookup-minimum';

/** Waits this long after the last key before asking. */
const DELAY_MS = 200;

/** What the lookup found, and the text it was asked for. */
export interface LookupAnswer {
  query: string;
  groups: LookupGroup[];
}

/**
 * The top bar's lookup, `GET /v1/lookup` (ADR-056), for any box that
 * finds by it: the top bar's, and Movements' find box (126). Its kinds
 * are the reader's by permission, which the server decides.
 *
 * Asks after a pause in typing, never for text too short to ask
 * (lookupLongEnough), and drops an answer that arrives after a newer
 * question, so a list never shows results for old text. `type` is the
 * box's onInputChange; `clear` empties it and forgets any answer still
 * on its way.
 */
export function useLookup() {
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState<LookupAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef(0);

  // Fetches after the pause; the state that shows it is waiting, or that
  // the text is too short, is set where the typing happens (type).
  useEffect(() => {
    const query = text.trim();
    if (!lookupLongEnough(query)) return;

    const asked = ++latest.current;
    const timer = setTimeout(() => {
      api<LookupResponse>(`/lookup?q=${encodeURIComponent(query)}`)
        .then((response) => {
          // An answer to an older question is dropped.
          if (asked !== latest.current) return;
          setAnswer({ query, groups: response.groups });
        })
        .catch(() => {
          if (asked === latest.current) setAnswer(null);
        })
        .finally(() => {
          if (asked === latest.current) setLoading(false);
        });
    }, DELAY_MS);

    return () => clearTimeout(timer);
  }, [text]);

  function type(value: string) {
    setText(value);
    const long = lookupLongEnough(value);
    setLoading(long);
    if (!long) {
      // Too short to ask: forget any answer still on its way.
      latest.current += 1;
      setAnswer(null);
    }
  }

  function clear() {
    latest.current += 1;
    setText('');
    setAnswer(null);
    setLoading(false);
  }

  return { text, type, clear, answer, loading };
}
