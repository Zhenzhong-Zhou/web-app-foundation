import { LIGHT } from '../theme/tokens';

/**
 * An organization's logo (ADR-060), at the address the API serves it from,
 * and the white it sits on wherever the ground is dark, since most logos
 * are made for white. Wherever a logo is drawn: the corner, the rail's
 * top and its folded plate, Branding's preview. A file of its own, as
 * rail.ts is, since fast refresh needs a file of components to export
 * nothing else.
 */
export const logoSrc = (fileId: string) => `/api/v1/files/${fileId}`;

export const LOGO_PLATE = LIGHT.surface;
