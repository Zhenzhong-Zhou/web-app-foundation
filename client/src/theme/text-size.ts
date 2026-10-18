import { useSyncExternalStore } from 'react';

/**
 * The person's text size (ADR-075): three steps, kept on this device as
 * the colour mode is, since the size someone needs depends on the screen
 * as much as on them.
 */
export const TEXT_SIZES = ['standard', 'large', 'larger'] as const;

export type TextSize = (typeof TEXT_SIZES)[number];

/**
 * Each step as a share of the browser's own font size. A percentage on
 * <html> multiplies a size the person already set in the browser rather
 * than replacing it, and every type size is rem, so this one value moves
 * every screen. No step past 125%: the breakpoints are px, so more would
 * crowd the wide layout, and browser zoom does the rest.
 */
export const TEXT_SCALE: Record<TextSize, number> = {
  standard: 100,
  large: 112.5,
  larger: 125,
};

const STORAGE_KEY = 'textSize';

export function isTextSize(value: unknown): value is TextSize {
  return (
    typeof value === 'string' &&
    (TEXT_SIZES as readonly string[]).includes(value)
  );
}

function stored(): TextSize {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isTextSize(value) ? value : 'standard';
  } catch {
    // Storage refused (a locked-down browser): Standard, for this visit.
    return 'standard';
  }
}

function remember(size: TextSize): void {
  try {
    // Standard is the absence of a choice, so nothing is left behind.
    if (size === 'standard') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, size);
  } catch {
    // Not remembered on this device; it is applied for this visit.
  }
}

let current: TextSize = 'standard';
const listeners = new Set<() => void>();

/** Standard clears the style, so the stylesheet's own size stands. */
function apply(size: TextSize): void {
  document.documentElement.style.fontSize =
    size === 'standard' ? '' : `${TEXT_SCALE[size]}%`;
}

function publish(size: TextSize): void {
  current = size;
  apply(size);
  for (const listener of listeners) listener();
}

let started = false;

/**
 * Applies this device's choice. Called by main.tsx before the first render,
 * so the first paint is already at the chosen size, not Standard for a
 * moment. Another tab's change follows here through the storage event, as
 * the colour mode does.
 */
export function initTextSize(): void {
  publish(stored());
  if (started) return;
  started = true;

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    publish(stored());
  });
}

export function setTextSize(size: TextSize): void {
  remember(size);
  publish(size);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): TextSize {
  return current;
}

/** The size now, and the way to change it; every picker shows the same. */
export function useTextSize(): [TextSize, (size: TextSize) => void] {
  return [useSyncExternalStore(subscribe, snapshot), setTextSize];
}
