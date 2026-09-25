/**
 * Today as the person's own calendar day, YYYY-MM-DD.
 *
 * Read from local components, never `toISOString()`, which is the UTC day:
 * at 5pm in Vancouver that is already tomorrow, and an invoice dated
 * tomorrow is wrong on paper. The server stores what this sends, as it
 * arrives, in a `date` column (ADR-046).
 */
export function todayLocal(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Address lines as one line of text, skipping what is empty. */
export function oneLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(', ');
}
