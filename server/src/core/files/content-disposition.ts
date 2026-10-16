/**
 * How a file is served, under its name: a plain ASCII name for old
 * clients, with no quote to end it early, and the real one for everyone
 * else.
 */
export function dispositionOf(
  type: 'inline' | 'attachment',
  name: string,
): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
