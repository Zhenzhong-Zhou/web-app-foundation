import { matchRoutes } from 'react-router-dom';

import { SIGNED_IN_ROUTES } from '../routes';

/**
 * The frame every signed-in page sits in, its gutters included, centred
 * beside the rail (ADR-090, amended November 2026): about 68 px empty on
 * each side at 1920, none at 1366, and no wider on a larger screen, where
 * a table would be wider than a person reads across. One setting, in px
 * rather than rem, so it stays 1,600 at Large and Larger text.
 */
export const FRAME_WIDTH = 1600;

/**
 * The main `Container`'s width for the page at this address: `lg`'s
 * 1,200 px for a page its route names narrower, Home and a page that is
 * one form, centred like the frame, so it looks as it did; the frame's for
 * every other. A page never sets a width of its own
 * (e2e/page-frame.spec.ts).
 */
export function frameWidth(pathname: string): typeof FRAME_WIDTH | 'lg' {
  const [match] = matchRoutes(SIGNED_IN_ROUTES, pathname) ?? [];
  return match?.route.narrower ? 'lg' : FRAME_WIDTH;
}
