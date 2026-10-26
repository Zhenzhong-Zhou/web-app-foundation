import type { OrganizationFileKind } from '../../database/schema';
import type { Permission } from '../authorization/permissions';
import type { Sniffed } from './sniff';

const MB = 1024 * 1024;

/** What each kind of file accepts and who may do what with it (ADR-059). */
export interface KindRule {
  accepts: readonly Sniffed[];
  /** Enforced on the stream: the upload is cut off here. */
  maxBytes: number;
  /** Who may upload one: the permission of what it is for. */
  upload: Permission;
  /** Who may read one; null for any member (the logo is everyone's). */
  view: Permission | null;
  render: 'logo' | 'squareLogo' | 'photo';
  /**
   * What its sizes are kept as, the renderer's output: a logo keeps PNG,
   * lossless for flat colour and sharp edges; a photo WebP.
   */
  format: 'png' | 'webp';
}

/** An organization's kinds; a person's photo is not uploaded here (ADR-063). */
export const KIND_RULES: Record<OrganizationFileKind, KindRule> = {
  logo: {
    accepts: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 2 * MB,
    upload: 'organizations.update',
    view: null,
    render: 'logo',
    format: 'png',
  },
  square_logo: {
    accepts: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 2 * MB,
    upload: 'organizations.update',
    view: null,
    render: 'squareLogo',
    format: 'png',
  },
  product_image: {
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 20 * MB,
    upload: 'products.update',
    view: 'products.view',
    render: 'photo',
    format: 'webp',
  },
};
