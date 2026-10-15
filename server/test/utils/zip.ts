import { inflateRawSync } from 'node:zlib';

/**
 * Reads a ZIP the export wrote, from its central directory: name to bytes.
 * Enough for the tests, which read archives of a few kilobytes: no ZIP64,
 * stored or deflated entries only. The server writes with yazl; reading
 * here needs no library of its own.
 */
export function readZip(archive: Buffer): Map<string, Buffer> {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error('Not a ZIP: no end of central directory');

  const entries = archive.readUInt16LE(end + 10);
  let at = archive.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();

  for (let i = 0; i < entries; i += 1) {
    if (archive.readUInt32LE(at) !== 0x02014b50) {
      throw new Error(`Not a central directory entry at ${at}`);
    }
    const method = archive.readUInt16LE(at + 10);
    const compressed = archive.readUInt32LE(at + 20);
    const nameLength = archive.readUInt16LE(at + 28);
    const extraLength = archive.readUInt16LE(at + 30);
    const commentLength = archive.readUInt16LE(at + 32);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);

    const start =
      local +
      30 +
      archive.readUInt16LE(local + 26) +
      archive.readUInt16LE(local + 28);
    const data = archive.subarray(start, start + compressed);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));

    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

/**
 * A CSV as the export writes it (RFC 4180, a byte-order mark first), as
 * one object per row keyed by the header.
 */
export function readCsv(bytes: Buffer): Record<string, string>[] {
  const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i += 1;
    } else {
      field += char;
    }
  }

  const [header, ...records] = rows;
  return records.map((values) =>
    Object.fromEntries(header.map((name, i) => [name, values[i]])),
  );
}
