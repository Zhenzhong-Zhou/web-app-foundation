/**
 * The ids Help's elements carry, in a file of their own: the components'
 * files may export nothing but components, for fast refresh.
 */

/** The panel beside or over the page, which the Help button controls. */
export const HELP_PANEL_ID = 'help-panel';

/** Help's own heading, which names the panel. */
export const HELP_HEADING_ID = 'help-heading';

/** The guide's title, which takes focus when a guide is asked for. */
export const GUIDE_TITLE_ID = 'help-guide-title';

/** A section's heading: prefixed, so a guide's ids never meet a page's. */
export const sectionElementId = (id: string) => `help-${id}`;
