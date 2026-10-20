import { useContext, useEffect } from 'react';

import { UnverifiedBannerContext } from './unverified-banner-context';

/**
 * Keeps the confirm-your-email banner off while `covered`, and gives it
 * back when the page goes: every other page keeps it (ADR-079).
 */
export function useCoverUnverifiedBanner(covered: boolean): void {
  const cover = useContext(UnverifiedBannerContext);
  useEffect(() => {
    cover(covered);
    return () => cover(false);
  }, [cover, covered]);
}
