import sharp from 'sharp';

import type { FileSize } from '../../database/schema';
import type { Sniffed } from './sniff';

interface PhotoSize {
  /** The longer side, in pixels. */
  long: number;
  /** WebP quality, 0 to 100. */
  quality: number;
}

/** The three sizes of a photo (ADR-059). */
export const PHOTO_SIZES: Record<FileSize, PhotoSize> = {
  thumb: { long: 400, quality: 75 },
  display: { long: 1200, quality: 80 },
  full: { long: 3000, quality: 85 },
};

/** A logo is kept at most this wide, and must be at least LOGO_MIN wide. */
export const LOGO_MAX = 1024;
export const LOGO_MIN = 256;

/** Decoding stops past this many pixels: a 20 MB upload can claim billions. */
const MAX_PIXELS = 50_000_000;

/** One size, as written. */
export interface Rendered {
  size: FileSize;
  data: Buffer;
  width: number;
  height: number;
}

/** The bytes do not decode as the image they claim to be. */
export class UnreadableImage extends Error {}

/** A raster logo narrower than LOGO_MIN. */
export class LogoTooSmall extends Error {}

/**
 * A photo in its three sizes: decoded, turned upright, sRGB, every piece of
 * metadata dropped (sharp keeps none unless asked), WebP. Proportions kept,
 * never enlarged, never cropped.
 */
export function renderPhoto(input: Buffer): Promise<Rendered[]> {
  return decoded(async () => {
    const source = sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_PIXELS,
    })
      .rotate()
      .toColourspace('srgb');

    return Promise.all(
      (Object.keys(PHOTO_SIZES) as FileSize[]).map(async (size) => {
        const { long, quality } = PHOTO_SIZES[size];
        const { data, info } = await source
          .clone()
          .resize({
            width: long,
            height: long,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .webp({ quality })
          .toBuffer({ resolveWithObject: true });
        return { size, data, width: info.width, height: info.height };
      }),
    );
  });
}

/**
 * A logo as one PNG, at most LOGO_MAX on its longer side. An SVG is drawn
 * here and only the PNG is kept, so nothing an SVG carries ever runs; the
 * renderer loads nothing outside it, as it reads from memory.
 */
export function renderLogo(input: Buffer, type: Sniffed): Promise<Rendered[]> {
  return decoded(async () => {
    const vector = type === 'image/svg+xml';
    const image = sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_PIXELS,
      density: vector ? 300 : 72,
    });

    if (!vector) {
      const { width = 0 } = await image.metadata();
      if (width < LOGO_MIN) throw new LogoTooSmall();
    }

    const { data, info } = await image
      .rotate()
      .resize({
        width: LOGO_MAX,
        height: LOGO_MAX,
        fit: 'inside',
        // A vector has no pixels of its own to lose.
        withoutEnlargement: !vector,
      })
      .toColourspace('srgb')
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    return [{ size: 'full', data, width: info.width, height: info.height }];
  });
}

/** Any failure to decode is the upload's fault, said once. */
async function decoded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof LogoTooSmall) throw error;
    throw new UnreadableImage(
      error instanceof Error ? error.message : String(error),
    );
  }
}
