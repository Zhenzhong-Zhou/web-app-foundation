/**
 * What `read` finds at Standard text and at Larger (the root at 125 %), so
 * a spec can see a size in rem grow with the text (ADR-075). The root's
 * size is put back after, whatever `read` does.
 */
export function atTextSizes<T>(read: () => T): { standard: T; larger: T } {
  const root = document.documentElement.style;
  try {
    root.fontSize = '';
    const standard = read();
    root.fontSize = '125%';
    return { standard, larger: read() };
  } finally {
    root.fontSize = '';
  }
}
