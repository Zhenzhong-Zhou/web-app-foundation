/**
 * Opens a dialog without leaving focus on the button that opened it.
 *
 * MUI sets aria-hidden on the surrounding DOM while the trigger still has
 * focus, which Chrome blocks with a console warning. Known open MUI issue, no
 * fix shipped. Blurring first sidesteps it and costs nothing — the dialog
 * moves focus to its own first field either way.
 *
 * Not disableRestoreFocus on the Dialog, which silences the close-time variant
 * by never returning focus to where you were. That trades a warning for the
 * thing the warning is about.
 *
 * Blurring leaves MUI nothing to give focus back to when the dialog closes, so
 * the button is kept here and `returnFocus` gives it back (#155).
 */
export function openDialog(open: () => void) {
  return (event: { currentTarget: HTMLElement }) => {
    waiting = event.currentTarget;
    event.currentTarget.blur();
    open();
  };
}

/** The button whose dialog has not opened yet. */
let waiting: HTMLElement | null = null;

/** Each open dialog's button, and what watches it leave, by its element. */
const openers = new WeakMap<
  HTMLElement,
  { opener: HTMLElement; watch: MutationObserver }
>();

/**
 * The theme puts these on every dialog's and drawer's transition. A dialog
 * takes the waiting button as it opens, so one opened from inside another
 * gives focus back to the button inside the first. Once it has closed, and
 * MUI has taken aria-hidden off the page again, so the close-time warning
 * cannot arise either, the button has focus back: unless something has put
 * focus elsewhere meanwhile, or the button has gone from the page.
 *
 * A dialog keyed by whether it is open, as many are so that each opening
 * starts afresh, is unmounted the moment it closes, with no transition out
 * to say so; it is watched for leaving the page instead.
 */
export const returnFocus = {
  onEnter(node: HTMLElement) {
    if (!waiting) return;
    const watch = new MutationObserver(() => {
      if (!node.isConnected) giveBack(node);
    });
    watch.observe(node.ownerDocument.body, { childList: true });
    openers.set(node, { opener: waiting, watch });
    waiting = null;
  },
  onExited(node: HTMLElement) {
    giveBack(node);
  },
};

function giveBack(node: HTMLElement) {
  const open = openers.get(node);
  if (!open) return;
  openers.delete(node);
  open.watch.disconnect();
  const { activeElement, body } = node.ownerDocument;
  const lost =
    !activeElement || activeElement === body || node.contains(activeElement);
  if (open.opener.isConnected && lost) open.opener.focus();
}
