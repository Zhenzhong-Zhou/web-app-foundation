import { LIGHT } from '../theme/tokens';

/**
 * An organization's logo (ADR-060), at the address the API serves it from,
 * and the white it sits on wherever the ground is dark, since most logos
 * are made for white. Wherever a logo is drawn: the corner, the rail's
 * top and its folded plate, Branding's preview. A file of its own, as
 * rail.ts is, since fast refresh needs a file of components to export
 * nothing else.
 *
 * `size` for a square logo, which keeps two (ADR-060, amended): `thumb`
 * wherever it is drawn small, `full` for Branding's thumbnail. The main
 * logo keeps one and is asked for none.
 */
export const logoSrc = (fileId: string, size?: 'thumb' | 'full') =>
  size ? `/api/v1/files/${fileId}?size=${size}` : `/api/v1/files/${fileId}`;

export const LOGO_PLATE = LIGHT.surface;

/** The box around a logo on the white plate. */
export const LOGO_ON_PLATE = {
  bgcolor: LOGO_PLATE,
  borderRadius: 1,
  px: 1,
  py: 0.5,
} as const;

/** The same, even all round, so a square logo's plate is square. */
export const SQUARE_LOGO_ON_PLATE = {
  bgcolor: LOGO_PLATE,
  borderRadius: 1,
  p: 0.5,
} as const;
