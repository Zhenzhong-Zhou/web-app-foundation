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

/**
 * A person's photo (ADR-063): square, since a face is shown in a circle,
 * small for the circles beside names, larger for their own page.
 */
export const AVATAR_SIZES = {
  thumb: { side: 128, quality: 80 },
  full: { side: 512, quality: 85 },
} as const;

/** A logo is kept at most this wide, and must be at least LOGO_MIN wide. */
export const LOGO_MAX = 1024;
export const LOGO_MIN = 256;

/**
 * A square logo (ADR-060, amended): a raster at least SQUARE_LOGO_MIN on
 * each side, kept in two sizes, each its longer side at most.
 */
export const SQUARE_LOGO_MIN = 128;
export const SQUARE_LOGO_SIZES = { thumb: 128, full: 512 } as const;

/**
 * How far from square a square logo may be, either way: the folded
 * plate's own rule. The client holds the same 1.25 for the plate
 * (client/src/layout/use-plate.ts); the two packages share no code, so
 * each keeps its own.
 */
export const SQUARE_ENOUGH = 1.25;

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

/**
 * An image its kind refuses, and why: a raster logo narrower than
 * LOGO_MIN, a raster square logo under SQUARE_LOGO_MIN on either side, or
 * a square logo further from square than SQUARE_ENOUGH. Any other failure
 * is UnreadableImage.
 */
export class ImageRefused extends Error {
  constructor(
    readonly reason:
      'logoTooSmall' | 'squareLogoTooSmall' | 'squareLogoNotSquare',
  ) {
    super(reason);
  }
}

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
 * A person's photo in its two sizes: like a photo, upright, sRGB and
 * without metadata, but cropped square from the centre, the part a circle
 * shows (ADR-063). Enlarged if smaller, so a small photo still fills its
 * circle.
 */
export function renderAvatar(input: Buffer): Promise<Rendered[]> {
  return decoded(async () => {
    const source = sharp(input, {
      failOn: 'error',
      limitInputPixels: MAX_PIXELS,
    })
      .rotate()
      .toColourspace('srgb');

    return Promise.all(
      (Object.keys(AVATAR_SIZES) as (keyof typeof AVATAR_SIZES)[]).map(
        async (size) => {
          const { side, quality } = AVATAR_SIZES[size];
          const { data, info } = await source
            .clone()
            .resize({ width: side, height: side, fit: 'cover' })
            .webp({ quality })
            .toBuffer({ resolveWithObject: true });
          return { size, data, width: info.width, height: info.height };
        },
      ),
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
    const { width, long } = await declared(input);
    if (!vector && width < LOGO_MIN) throw new ImageRefused('logoTooSmall');

    return [
      { size: 'full', ...(await drawPng(input, vector, long, LOGO_MAX)) },
    ];
  });
}

/**
 * A square logo as two PNGs, each fitting its size: never cropped or
 * padded, a raster never enlarged. Its proportions are checked first, an
 * SVG's by the size it declares; then each size is drawn, and only the
 * PNGs kept, as for the logo.
 */
export function renderSquareLogo(
  input: Buffer,
  type: Sniffed,
): Promise<Rendered[]> {
  return decoded(async () => {
    const vector = type === 'image/svg+xml';
    const { width, height, long } = await declared(input);
    if (!vector && Math.min(width, height) < SQUARE_LOGO_MIN) {
      throw new ImageRefused('squareLogoTooSmall');
    }
    if (long / Math.min(width, height) > SQUARE_ENOUGH) {
      throw new ImageRefused('squareLogoNotSquare');
    }

    return Promise.all(
      (
        Object.keys(SQUARE_LOGO_SIZES) as (keyof typeof SQUARE_LOGO_SIZES)[]
      ).map(async (size) => ({
        size,
        ...(await drawPng(input, vector, long, SQUARE_LOGO_SIZES[size])),
      })),
    );
  });
}

/**
 * The size an image declares, an SVG's at 72 dpi. Read, not drawn, so with
 * no pixel limit: an SVG declared thousands of pixels wide is drawn small
 * below, under the limit, which the drawing keeps.
 */
async function declared(input: Buffer) {
  const { width = 0, height = 0 } = await sharp(input, {
    failOn: 'error',
    limitInputPixels: false,
    density: 72,
  }).metadata();
  if (!width || !height) throw new Error('The image has no size');
  return { width, height, long: Math.max(width, height) };
}

/**
 * An image as a PNG fitting `side` × `side`, upright and sRGB: never
 * cropped or padded, a raster never enlarged. An SVG is drawn at that
 * size, its density from its declared longer side (`long`), not drawn
 * large and scaled down, so it stays sharp and under the pixel limit
 * whatever size it declares.
 */
async function drawPng(
  input: Buffer,
  vector: boolean,
  long: number,
  side: number,
): Promise<Omit<Rendered, 'size'>> {
  // Within the 1 to 100,000 dpi sharp draws at; the resize below makes up
  // any difference.
  const density = vector
    ? Math.min(100_000, Math.max(1, (72 * side) / long))
    : 72;
  const { data, info } = await sharp(input, {
    failOn: 'error',
    limitInputPixels: MAX_PIXELS,
    density,
  })
    .rotate()
    .resize({
      width: side,
      height: side,
      fit: 'inside',
      // A vector has no pixels of its own to lose.
      withoutEnlargement: !vector,
    })
    .toColourspace('srgb')
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * A kept logo small enough to send inline, for the invitation page
 * (ADR-077): twice the 32 px it is shown at, so it stays sharp, and at
 * most four times as wide. Never enlarged.
 */
export function renderLogoMark(logo: Buffer): Promise<Buffer> {
  return sharp(logo, { failOn: 'error', limitInputPixels: MAX_PIXELS })
    .resize({ width: 256, height: 64, fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Any failure to decode is the upload's fault, said once. */
async function decoded<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof ImageRefused) throw error;
    throw new UnreadableImage(
      error instanceof Error ? error.message : String(error),
    );
  }
}
