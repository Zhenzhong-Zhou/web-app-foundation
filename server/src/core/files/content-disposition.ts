/** A name as a file's: `/` would make a folder (ADR-073). */
export function fileNameOf(name: string): string {
  return name.replaceAll('/', '_');
}

/**
 * How a file is served, under its name: a plain ASCII name for old
 * clients, with no quote to end it early, and the real one for everyone
 * else; a `/` in either, such as a number's, written as `_`.
 */
export function dispositionOf(
  type: 'inline' | 'attachment',
  name: string,
): string {
  const file = fileNameOf(name);
  const ascii = file.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file)}`;
}
