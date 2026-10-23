import type { ComponentProps } from 'react';

import { NewVersionBanner } from './new-version-banner';
import { VersionAnnouncement } from './version-announcement';

/**
 * Every dialog's paper, given by the theme's dialog defaults (ADR-081):
 * MUI's own, styles and all, rendered as this element, which puts the
 * amber line above everything the dialog holds, its title included. Added
 * once here rather than in each of the seventy dialogs. A dialog that only
 * shows something, as the image viewer, or that is not one to the person,
 * as Help and the lookup on a phone, opts out with a plain `div`.
 *
 * The new version's arrival is said here too: an open dialog hides the
 * page from a screen reader, the top bar's announcement with it.
 */
export function VersionPaper({ children, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props}>
      <VersionAnnouncement />
      <NewVersionBanner where="dialog" />
      {children}
    </div>
  );
}
