import sharp from 'sharp';

import {
  ImageRefused,
  renderLogo,
  renderPhoto,
  renderSquareLogo,
  UnreadableImage,
} from './images';

/** A plain photo, with a camera's metadata to be dropped. */
function photo(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#c07828' },
  })
    .withExif({ IFD0: { Copyright: 'somebody', Artist: 'a phone' } })
    .jpeg()
    .toBuffer();
}

describe('renderPhoto', () => {
  it('keeps three sizes in proportion, as WebP, without metadata', async () => {
    const sizes = await renderPhoto(await photo(4000, 3000));
    const got = sizes.map(({ size, width, height }) => [size, width, height]);

    expect(got).toEqual([
      ['thumb', 400, 300],
      ['display', 1200, 900],
      ['full', 3000, 2250],
    ]);
    for (const { data } of sizes) {
      const kept = await sharp(data).metadata();
      expect(kept.format).toBe('webp');
      expect(kept.exif).toBeUndefined();
    }
  });

  it('never enlarges a small photo', async () => {
    const sizes = await renderPhoto(await photo(300, 200));
    expect(sizes.map(({ width, height }) => [width, height])).toEqual([
      [300, 200],
      [300, 200],
      [300, 200],
    ]);
  });

  it('refuses what does not decode', async () => {
    const broken = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(200, 7),
    ]);
    await expect(renderPhoto(broken)).rejects.toBeInstanceOf(UnreadableImage);
  });
});

describe('renderLogo', () => {
  it('draws an SVG to a PNG, and keeps only the PNG', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="#2a6"/></svg>',
    );
    const [logo] = await renderLogo(svg, 'image/svg+xml');

    expect(logo.size).toBe('full');
    expect((await sharp(logo.data).metadata()).format).toBe('png');
    // Drawn at the size kept: a pixel either way is rounding.
    expect(logo.width).toBe(1024);
    expect(Math.abs(logo.height - 512)).toBeLessThanOrEqual(1);
  });

  /**
   * Drawn at the size kept, not at 300 dpi and scaled, an SVG that
   * declares itself large stays under the pixel limit: one of 1700 px, as
   * a designer's export often is, was refused as unreadable.
   */
  it('draws an SVG declared 1700 px or wider', async () => {
    const svg = (width: number, height: number) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#2a6"/></svg>`,
      );

    for (const [width, height, kept] of [
      [1700, 1700, [1024, 1024]],
      [4000, 1000, [1024, 256]],
      [12000, 12000, [1024, 1024]],
    ] as const) {
      const [logo] = await renderLogo(svg(width, height), 'image/svg+xml');
      expect([logo.width, logo.height]).toEqual(kept);
      expect((await sharp(logo.data).metadata()).format).toBe('png');
    }
  });

  it('refuses a raster logo narrower than 256 px', async () => {
    const small = await sharp({
      create: { width: 200, height: 100, channels: 4, background: '#fff0' },
    })
      .png()
      .toBuffer();
    const refused = renderLogo(small, 'image/png');
    await expect(refused).rejects.toBeInstanceOf(ImageRefused);
    await expect(refused).rejects.toHaveProperty('reason', 'logoTooSmall');
  });

  it('shrinks a large logo, never enlarges a raster one', async () => {
    const wide = await sharp({
      create: { width: 3000, height: 1000, channels: 4, background: '#fff0' },
    })
      .png()
      .toBuffer();
    const [shrunk] = await renderLogo(wide, 'image/png');
    expect([shrunk.width, shrunk.height]).toEqual([1024, 341]);

    const modest = await sharp({
      create: { width: 400, height: 100, channels: 4, background: '#fff0' },
    })
      .png()
      .toBuffer();
    const [kept] = await renderLogo(modest, 'image/png');
    expect([kept.width, kept.height]).toEqual([400, 100]);
  });
});

describe('renderSquareLogo', () => {
  function png(width: number, height: number): Promise<Buffer> {
    return sharp({
      create: { width, height, channels: 4, background: '#2a6f' },
    })
      .png()
      .toBuffer();
  }

  async function sizesOf(input: Buffer, type: 'image/png' | 'image/svg+xml') {
    const sizes = await renderSquareLogo(input, type);
    for (const { data } of sizes) {
      expect((await sharp(data).metadata()).format).toBe('png');
    }
    return sizes.map(({ size, width, height }) => [size, width, height]);
  }

  it('keeps a square one and a 5 : 4 one, each in two sizes', async () => {
    expect(await sizesOf(await png(600, 600), 'image/png')).toEqual([
      ['thumb', 128, 128],
      ['full', 512, 512],
    ]);
    expect(await sizesOf(await png(1000, 800), 'image/png')).toEqual([
      ['thumb', 128, 102],
      ['full', 512, 410],
    ]);
  });

  it('refuses one wider than 5 : 4', async () => {
    await expect(
      renderSquareLogo(await png(600, 400), 'image/png'),
    ).rejects.toHaveProperty('reason', 'squareLogoNotSquare');
  });

  it('refuses a raster under 128 px on a side', async () => {
    await expect(
      renderSquareLogo(await png(100, 100), 'image/png'),
    ).rejects.toHaveProperty('reason', 'squareLogoTooSmall');
  });

  it('shrinks a large one to 512 and 128', async () => {
    expect(await sizesOf(await png(2000, 2000), 'image/png')).toEqual([
      ['thumb', 128, 128],
      ['full', 512, 512],
    ]);
  });

  it('never enlarges a raster', async () => {
    expect(await sizesOf(await png(200, 200), 'image/png')).toEqual([
      ['thumb', 128, 128],
      ['full', 200, 200],
    ]);
  });

  it('draws an SVG to each size, its proportions checked', async () => {
    const svg = (width: number, height: number) =>
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#2a6"/></svg>`,
      );

    // Small as drawn, and no raster's minimum: drawn up to each size.
    expect(await sizesOf(svg(40, 40), 'image/svg+xml')).toEqual([
      ['thumb', 128, 128],
      ['full', 512, 512],
    ]);
    await expect(
      renderSquareLogo(svg(60, 40), 'image/svg+xml'),
    ).rejects.toHaveProperty('reason', 'squareLogoNotSquare');
    // Declared far larger than the pixel limit allows to draw at that size.
    expect(await sizesOf(svg(12000, 12000), 'image/svg+xml')).toEqual([
      ['thumb', 128, 128],
      ['full', 512, 512],
    ]);
  });
});
