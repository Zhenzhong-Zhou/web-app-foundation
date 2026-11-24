/**
 * Puts text on the clipboard, saying whether it went, so the caller can
 * say what to copy by hand where the browser refused: an invitation's
 * link, a lot code made for us (review 47).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
