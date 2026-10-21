import { Snackbar, type SnackbarProps } from '@mui/material';
import { useState } from 'react';

/**
 * The message after something that can be undone, gone after
 * `autoHideDuration` unless someone is using it (WCAG 2.2.1): its timer
 * waits while focus or the pointer is on it, and runs again only once both
 * have left. MUI's own runs again as soon as either leaves, so a pointer
 * passing over it while focus sat on Undo let the message go, and focus
 * with it.
 */
export function UndoSnackbar({
  open,
  autoHideDuration,
  onFocus,
  onBlur,
  onMouseEnter,
  onMouseLeave,
  ...props
}: SnackbarProps & { open: boolean }) {
  const [focused, setFocused] = useState(false);
  const [pointed, setPointed] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    // Shown again: whatever held it last time went with it, unannounced,
    // as a pressed Undo does.
    if (open) {
      setFocused(false);
      setPointed(false);
    }
  }

  return (
    <Snackbar
      {...props}
      open={open}
      // No timer while held, so MUI's resume when one of the two leaves
      // starts nothing; given back once both have, it starts again.
      autoHideDuration={focused || pointed ? null : autoHideDuration}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      onMouseEnter={(event) => {
        setPointed(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setPointed(false);
        onMouseLeave?.(event);
      }}
    />
  );
}
