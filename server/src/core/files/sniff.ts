/** The types an upload can be, as recognised from its bytes (ADR-059). */
export type Sniffed =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/svg+xml'
  | 'application/pdf';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

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
 * Text whose root element is `<svg`, after an optional XML declaration,
 * comments and doctype. A NUL in the first kilobyte means binary, not SVG.
 */
function isSvg(bytes: Buffer): boolean {
  const head = bytes.subarray(0, 1024);
  if (head.includes(0)) return false;
  const text = head.toString('utf8').replace(/^\uFEFF/, '').trimStart();
  return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(
    text,
  );
}
