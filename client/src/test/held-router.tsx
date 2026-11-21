import { act } from '@testing-library/react';
import { type ReactNode, useState } from 'react';
import { createPath, type Navigator, Router, type To } from 'react-router-dom';

/**
 * A router as react-router 7 is on a slow runner: a write reaches the
 * address at once, and the page shows it only when `show` is called, as
 * the transition react-router renders it in can finish after a search's
 * wait has ended (#636).
 */
export function heldRouter(start: string) {
  let address = start;
  let show = () => {};
  const write = (to: To) => {
    address = typeof to === 'string' ? to : createPath(to);
  };
  const navigator: Navigator = {
    createHref: (to) => (typeof to === 'string' ? to : createPath(to)),
    go: () => {},
    push: write,
    replace: write,
  };

  function HeldRouter({ children }: { children: ReactNode }) {
    const [shown, setShown] = useState(start);
    show = () => setShown(address);
    return (
      <Router location={shown} navigator={navigator}>
        {children}
      </Router>
    );
  }

  return {
    HeldRouter,
    address: () => address,
    show: () => act(() => show()),
  };
}
