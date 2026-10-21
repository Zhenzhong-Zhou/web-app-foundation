/**
 * Read by a screen reader, not drawn: an actions column's header, on
 * Invited and on Members.
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
