/**
 * How many forms on the page have unsaved changes right now, for the idle
 * sign-out's warning to say so (ADR-065). Kept by useUnsavedChanges.
 */
let dirtyForms = 0;

export function markDirty(): () => void {
  dirtyForms += 1;
  return () => {
    dirtyForms = Math.max(0, dirtyForms - 1);
  };
}

export function hasUnsavedChanges(): boolean {
  return dirtyForms > 0;
}
