import type { ComponentProps } from 'react';

import { NewVersionBanner } from './new-version-banner';

/**
 * Every dialog's paper, given by the theme's dialog defaults (ADR-081):
 * MUI's own, styles and all, rendered as this element, which puts the
 * amber line above everything the dialog holds, its title included. Added
 * once here rather than in each of the seventy dialogs. A dialog that only
 * shows something, as the image viewer, or that is not one to the person,
 * as Help and the lookup on a phone, opts out with a plain `div`.
 */
export function VersionPaper({ children, ...props }: ComponentProps<'div'>) {
  return (
    <div {...props}>
      <NewVersionBanner where="dialog" />
      {children}
    </div>
  );
}
