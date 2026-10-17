/** Address lines as one line of text, skipping what is empty. */
export function oneLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}
