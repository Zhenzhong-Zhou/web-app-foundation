import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * A list's search box (ADR-056): what is typed, and what the list asks for,
 * a moment after typing stops. Starts from `?search=` in the address, so
 * the lookup's "Show all in Orders" opens the list already narrowed.
 */
export function useListSearch(): {
  text: string;
  setText: (text: string) => void;
  search: string;
} {
  const [params] = useSearchParams();
  const initial = params.get('search') ?? '';
  const [text, setText] = useState(initial);
  const [search, setSearch] = useState(initial.trim());

  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  return { text, setText, search };
}

/** A list's path with its search added, when there is one. */
export function withSearch(path: string, search: string): string {
  if (!search) return path;
  return `${path}${path.includes('?') ? '&' : '?'}search=${encodeURIComponent(search)}`;
}
