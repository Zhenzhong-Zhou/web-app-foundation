import { Tooltip } from '@mui/material';
import { type ReactElement, useState } from 'react';

/** Whether the name an event reached is cut, drawn shorter than it is. */
function isCut(target: EventTarget): boolean {
  const name =
    target instanceof Element ? target.closest('[data-cut-name]') : null;
  return !!name && name.scrollHeight > name.clientHeight + 1;
}

/**
 * A list's name, its one child the name's link marked `CUT_NAME`. Pinned
 * in a table too wide for its box, `ListTable` draws it at most two lines,
 * a longer name ending in "…"; then the whole name shows in a tooltip on
 * hover and on focus, which Escape closes and the pointer can rest on
 * (WCAG 1.4.13), never a `title` (ADR-090, amended November 2026; 83a).
 * Whole, it shows none. The cut is drawn, not written, so the link's
 * text, which a screen reader reads, stays the whole name.
 */
export function CutName({
  name,
  children,
}: {
  name: string;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip
      title={name}
      open={open}
      onOpen={(event) => setOpen(isCut(event.target))}
      onClose={() => setOpen(false)}
      placement="top-start"
    >
      {children}
    </Tooltip>
  );
}
