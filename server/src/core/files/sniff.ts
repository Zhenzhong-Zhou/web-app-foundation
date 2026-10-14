/** The types an upload can be, as recognised from its bytes (ADR-059). */
export type Sniffed =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/svg+xml'
  | 'application/pdf';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

/** What may come before an SVG's root element: one at a time. */
const PROLOG_ITEM = /^(?:<\?xml[^>]*>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>)\s*/i;

/**
 * What a file is, from its first bytes: never from its name or from what
 * the browser said. Null for anything not accepted anywhere.
 */
export function sniff(bytes: Buffer): Sniffed | null {
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (isSvg(bytes)) return 'image/svg+xml';
  return null;
}

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((byte, i) => bytes[i] === byte)
  );
}

function ascii(bytes: Buffer, start: number, end: number): string {
  return bytes.subarray(start, end).toString('latin1');
}

/**
 * Text whose root element is `<svg`, after any number of `<?xml` items,
 * comments and doctypes, in any order. A NUL in the first kilobyte means
 * binary, not SVG.
 */
function isSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 1024);
  if (head.includes(0)) return false;
  const text = head
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  // One prolog item at a time: each match takes the shortest item off the
  // front and is never retried, so the work is linear in the input. Not
  // one pattern with a repeated comment: <!--[\s\S]*?--> can stretch past a
  // --> to take in the next comment, so a run of n comments splits 2^(n-1)
  // ways, all tried on text that never reaches <svg (CodeQL).
  let rest = text;
  for (let item = PROLOG_ITEM.exec(rest); item; item = PROLOG_ITEM.exec(rest)) {
    rest = rest.slice(item[0].length);
  }
  return /^<svg[\s>]/i.test(rest);
}
