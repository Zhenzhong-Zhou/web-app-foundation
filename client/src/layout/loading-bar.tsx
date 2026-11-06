import { Box } from '@mui/material';
import { keyframes } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { useLocation } from 'react-router-dom';

import { readsInFlight, subscribeToReads } from '../lib/reads-in-flight';
import { requestedPath, subscribeToNavigations } from './page-loading';

const SLIDE = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(250%); }
`;

/**
 * The top loading bar (ADR-090, ADR-091, #431): under the top bar, at once
 * on a tap inside the app, until the next screen's code and its first read
 * have landed. Without it a slow network showed the old screen for a
 * second or more, with only the address changed.
 *
 * Two waits, one after the other: the screen's code, while the router's
 * path is not yet the one shown (page-loading.ts); then the reads the new
 * screen sends as it first draws. Those go out from its effects, which run
 * in the same pass as this one's but after it, so the bar looks a moment
 * later. Another screen's path changes nothing here: a filter or a tab
 * shows its list's own placeholder.
 *
 * The store is read through an effect, not useSyncExternalStore, so a read
 * landing while React holds a screen in its transition does not make it
 * show the screen's fallback in its place.
 *
 * Under reduced motion the bar stands still: shown, it says enough.
 */
export function LoadingBar() {
  const intl = useIntl();
  const { pathname } = useLocation();
  const [requested, setRequested] = useState(requestedPath);
  const [reads, setReads] = useState(readsInFlight);
  useEffect(
    () => subscribeToNavigations(() => setRequested(requestedPath())),
    [],
  );
  useEffect(() => subscribeToReads(() => setReads(readsInFlight())), []);

  // The screen shown, and whether its first reads are still awaited.
  const [shown, setShown] = useState(pathname);
  const [awaiting, setAwaiting] = useState(false);
  const [looked, setLooked] = useState(false);
  if (shown !== pathname) {
    setShown(pathname);
    setAwaiting(true);
    setLooked(false);
  }
  useEffect(() => {
    if (!awaiting || looked) return;
    const timer = setTimeout(() => setLooked(true), 0);
    return () => clearTimeout(timer);
  }, [awaiting, looked]);
  if (awaiting && looked && reads === 0) setAwaiting(false);

  const code = requested !== null && requested !== pathname;
  if (!code && !awaiting) return null;

  return (
    <Box
      role="progressbar"
      aria-label={intl.formatMessage({
        id: 'common.loading',
        defaultMessage: 'Loading…',
      })}
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: 3,
        overflow: 'hidden',
        bgcolor: 'surface.chosen',
      }}
    >
      <Box
        sx={{
          width: '40%',
          height: '100%',
          bgcolor: 'primary.main',
          animation: `${SLIDE} 1.2s ease-in-out infinite`,
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
    </Box>
  );
}
