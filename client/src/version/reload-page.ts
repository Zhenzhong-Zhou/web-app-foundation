/**
 * The page loaded in full, from whatever build the server now has. A
 * module of its own so a component test can stand in for it: jsdom loads
 * no pages.
 */
export function reloadPage(): void {
  window.location.reload();
}
