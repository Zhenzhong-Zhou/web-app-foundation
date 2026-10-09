import sharp from 'sharp';

import {
  LogoTooSmall,
  renderLogo,
  renderPhoto,
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
    expect([logo.width, logo.height]).toEqual([1024, 512]);
  });

  it('refuses a raster logo narrower than 256 px', async () => {
    const small = await sharp({
      create: { width: 200, height: 100, channels: 4, background: '#fff0' },
    })
      .png()
      .toBuffer();
    await expect(renderLogo(small, 'image/png')).rejects.toBeInstanceOf(
      LogoTooSmall,
    );
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
