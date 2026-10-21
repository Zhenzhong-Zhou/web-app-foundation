import { useContext, useLayoutEffect } from 'react';

import { UnverifiedBannerContext } from './unverified-banner-context';

/**
 * Keeps the confirm-your-email banner off while `covered`, and gives it
 * back when the page goes: every other page keeps it (ADR-079). Before the
 * page is painted, so the banner never shows for a frame and pushes the
 * page down as it goes.
 */
export function useCoverUnverifiedBanner(covered: boolean): void {
  const cover = useContext(UnverifiedBannerContext);
  useLayoutEffect(() => {
    cover(covered);
    return () => cover(false);
  }, [cover, covered]);
}
