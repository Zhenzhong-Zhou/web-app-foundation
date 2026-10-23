/**
 * Read by a screen reader, not drawn: an actions column's header, on
 * Invited and on Members, and a live region's words. One pixel, written as
 * '1px': in sx a bare 1 is 100%, which made such a box as wide as the
 * window and the page scroll sideways.
 */
export const HIDDEN = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  border: 0,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
  clip: 'rect(0 0 0 0)',
} as const;
