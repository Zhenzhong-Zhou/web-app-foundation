/**
 * Eight colours a white initial reads on at AA in both colour modes
 * (ADR-063); a person gets the same one wherever they appear.
 */
const COLOURS = [
  '#5546B8',
  '#1F5FBF',
  '#0F6E6E',
  '#2F5D50',
  '#7A3B69',
  '#8A4B12',
  '#A1324F',
  '#3A4150',
];

/** Two letters: first and last name, else the first two of the email. */
export function initialsOf(name: string | null, email?: string | null): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email ?? '?').slice(0, 2).toUpperCase();
}

/** The same colour for the same name, from a small stable hash. */
export function colourOf(name: string | null, email?: string | null): string {
  const text = (name || email || '').toLowerCase();
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return COLOURS[hash % COLOURS.length];
}
