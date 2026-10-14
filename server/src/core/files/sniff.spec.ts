import { sniff } from './sniff';

describe('sniff', () => {
  const bytes = (...values: number[]) => Buffer.from(values);

  it('knows each accepted type by its first bytes', () => {
    const png = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0);
    expect(sniff(png)).toBe('image/png');
    expect(sniff(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniff(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe(
      'image/webp',
    );
    expect(sniff(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
  });

  it('knows an SVG after a declaration, a comment or a doctype', () => {
    const bare = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    expect(sniff(bare)).toBe('image/svg+xml');
    expect(
      sniff(
        Buffer.from(
          '\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<!DOCTYPE svg>\n<svg>',
        ),
      ),
    ).toBe('image/svg+xml');
  });

  /**
   * The text CodeQL warned about: a run of comments that never reaches an
   * <svg. Read one prolog item at a time, it is refused at once rather than
   * after trying every way of splitting the comments between two runs.
   */
  it('refuses a run of comments that never reaches <svg, quickly', () => {
    const comments = Buffer.from('<!---->'.repeat(140) + '<html>');
    const started = performance.now();

    expect(sniff(comments)).toBeNull();
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('goes by the bytes, never the name or the browser', () => {
    expect(sniff(Buffer.from('hello, I am a PNG'))).toBeNull();
    expect(sniff(Buffer.from('<html><svg></svg></html>'))).toBeNull();
    expect(sniff(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });

  it('takes nothing binary for an SVG', () => {
    expect(sniff(Buffer.from('<svg>\u0000'))).toBeNull();
  });
});
