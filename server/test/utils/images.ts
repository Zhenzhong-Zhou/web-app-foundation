import sharp from 'sharp';

/** A plain PNG of the size given, for an upload that has to decode. */
export function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 4, background: '#2a6f' },
  })
    .png()
    .toBuffer();
}
