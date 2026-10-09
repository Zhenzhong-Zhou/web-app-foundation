import type { FileKind } from '../../database/schema';
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
  render: 'logo' | 'photo';
}

export const KIND_RULES: Record<FileKind, KindRule> = {
  logo: {
    accepts: ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'],
    maxBytes: 2 * MB,
    upload: 'organizations.update',
    view: null,
    render: 'logo',
  },
  product_image: {
    accepts: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 20 * MB,
    upload: 'products.update',
    view: 'products.view',
    render: 'photo',
  },
};
