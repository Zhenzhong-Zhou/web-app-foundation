import type { Locator } from '@playwright/test';

/**
 * The cards Customise Home shows, in order: its panel's first list; the
 * hidden tiles are the second.
 */
export const shownCards = (panel: Locator) =>
  panel.getByRole('list').first().getByRole('listitem');
