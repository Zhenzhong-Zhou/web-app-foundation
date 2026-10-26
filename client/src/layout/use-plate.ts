import { type SyntheticEvent, useState } from 'react';

import { logoSrc } from './logo';

/**
 * How far from square a logo may be and still fill the folded plate. The
 * server holds the same 1.25 for a square logo's upload
 * (server/src/core/files/images.ts); the two packages share no code, so
 * each keeps its own.
 */
const SQUARE_ENOUGH = 1.25;

function isSquare(image: HTMLImageElement): boolean {
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height) return false;
  return Math.max(width, height) / Math.min(width, height) <= SQUARE_ENOUGH;
}

/** What the folded plate shows: an image on the white plate, or not. */
export type PlateFace =
  | { kind: 'squareLogo' | 'logo'; src: string }
  | { kind: 'initials' | 'measuring' };

/**
 * The folded rail's plate (ADR-082, ADR-060 amended), one rule for the rail
 * and Branding's preview, so the two cannot disagree: the square logo, at
 * once; else the main logo, once it is read to be about square; else the
 * organization's initials. `measuring` while the main logo's shape is
 * unknown, and `measure` the hidden image that reads it, for the caller to
 * draw. Its answer stays with the caller while the logo stays the same.
 */
export function usePlate(
  logoFileId: string | null,
  squareLogoFileId: string | null,
): {
  face: PlateFace;
  measure: {
    src: string;
    onLoad: (event: SyntheticEvent<HTMLImageElement>) => void;
    onError: () => void;
  } | null;
} {
  const [read, setRead] = useState<{ logo: string; square: boolean }>();

  if (squareLogoFileId) {
    return {
      face: { kind: 'squareLogo', src: logoSrc(squareLogoFileId, 'thumb') },
      measure: null,
    };
  }
  if (!logoFileId) return { face: { kind: 'initials' }, measure: null };

  const logo = logoSrc(logoFileId);
  if (read?.logo !== logo) {
    return {
      face: { kind: 'measuring' },
      measure: {
        src: logo,
        onLoad: (event) =>
          setRead({ logo, square: isSquare(event.currentTarget) }),
        onError: () => setRead({ logo, square: false }),
      },
    };
  }
  return {
    face: read.square ? { kind: 'logo', src: logo } : { kind: 'initials' },
    measure: null,
  };
}
