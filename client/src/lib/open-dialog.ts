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
 */
export function openDialog(open: () => void) {
  return (event: { currentTarget: HTMLElement }) => {
    event.currentTarget.blur();
    open();
  };
}
