/**
 * Back on a top-level page (#341). A detail page always offers Back
 * (PageHeader); a top-level page is reached from the menu, so it offers
 * none, unless a link inside the app brought the person there, as
 * Inventory's Trace a lot does. Such a link passes OFFER_BACK as its
 * router state, so the page knows from the link, not from a guess. The
 * menu, a new tab and a bookmark carry no state: no Back, as before.
 */
export const OFFER_BACK = { offerBack: true } as const;

/** Whether the link that opened this page passed OFFER_BACK. */
export function offersBack(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    'offerBack' in state &&
    state.offerBack === true
  );
}
