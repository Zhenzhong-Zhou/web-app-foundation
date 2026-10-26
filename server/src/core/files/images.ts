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
 * (client/src/layout/rail-top.tsx); the two packages share no code, so
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

/** A raster logo narrower than LOGO_MIN. */
export class LogoTooSmall extends Error {}

/** A raster square logo under SQUARE_LOGO_MIN on either side. */
export class SquareLogoTooSmall extends Error {}

/** A square logo further from square than SQUARE_ENOUGH. */
export class SquareLogoNotSquare extends Error {}

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

/**
 * A square logo as two PNGs, each fitting its size: never cropped or
 * padded, a raster never enlarged. Its proportions are checked first, an
 * SVG's by its drawn size; an SVG is then drawn at each size, not drawn
 * once and scaled, and only the PNGs kept, as for the logo.
 */
export function renderSquareLogo(
  input: Buffer,
  type: Sniffed,
): Promise<Rendered[]> {
  return decoded(async () => {
    const vector = type === 'image/svg+xml';
    const drawn = (density: number) =>
      sharp(input, {
        failOn: 'error',
        limitInputPixels: MAX_PIXELS,
        density,
      });

    // An SVG's size at 72 dpi is the one it declares.
    const { width = 0, height = 0 } = await drawn(72).metadata();
    if (!width || !height) throw new Error('The image has no size');
    const long = Math.max(width, height);
    if (!vector && Math.min(width, height) < SQUARE_LOGO_MIN) {
      throw new SquareLogoTooSmall();
    }
    if (long / Math.min(width, height) > SQUARE_ENOUGH) {
      throw new SquareLogoNotSquare();
    }

    return Promise.all(
      (
        Object.keys(SQUARE_LOGO_SIZES) as (keyof typeof SQUARE_LOGO_SIZES)[]
      ).map(async (size) => {
        const side = SQUARE_LOGO_SIZES[size];
        // Within the 1 to 100,000 dpi sharp draws at; the resize below
        // makes up any difference.
        const density = vector
          ? Math.min(100_000, Math.max(1, (72 * side) / long))
          : 72;
        const { data, info } = await drawn(density)
          .rotate()
          .resize({
            width: side,
            height: side,
            fit: 'inside',
            withoutEnlargement: !vector,
          })
          .toColourspace('srgb')
          .png({ compressionLevel: 9 })
          .toBuffer({ resolveWithObject: true });
        return { size, data, width: info.width, height: info.height };
      }),
    );
  });
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
    if (
      error instanceof LogoTooSmall ||
      error instanceof SquareLogoTooSmall ||
      error instanceof SquareLogoNotSquare
    ) {
      throw error;
    }
    throw new UnreadableImage(
      error instanceof Error ? error.message : String(error),
    );
  }
}
