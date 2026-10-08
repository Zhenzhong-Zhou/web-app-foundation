import { useCallback, useEffect, useRef } from 'react';
import { type Blocker, useBlocker } from 'react-router-dom';

/**
 * Leaving a form with changes asks first (issue #54, conventions.md).
 *
 * Inside the app, React Router's blocker holds the navigation until the
 * person chooses, shown by UnsavedChangesDialog. Closing the tab or
 * reloading gets the browser's own prompt, the only one a page may show
 * then. Nothing asks while the form is untouched.
 *
 * `release()` lets the next navigation through: call it just before
 * navigating away on purpose, after a save or on Cancel. A state change
 * would arrive too late, since the navigation happens in the same tick.
 */
export function useUnsavedChanges(dirty: boolean): {
  blocker: Blocker;
  release: () => void;
} {
  const released = useRef(false);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty &&
      !released.current &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (released.current) return;
      event.preventDefault();
      // Older browsers show the prompt only when this is set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const release = useCallback(() => {
    released.current = true;
  }, []);

  return { blocker, release };
}
