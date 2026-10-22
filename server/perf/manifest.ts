import { existsSync, readFileSync } from 'node:fs';

import type { VolumeManifest } from '../src/database/seed-volume';
import { manifestPath, type Scale, SCALES } from '../src/database/volume/scale';

/**
 * The manifest seed:volume wrote for the scale `--scale` names, small when
 * it names none (ADR-081), or what to do instead.
 */
export function readManifest(
  scale: string | undefined = 'small',
): VolumeManifest | string {
  if (!SCALES.includes(scale as Scale)) {
    return `--scale must be one of ${SCALES.join(', ')}`;
  }

  const path = manifestPath(scale as Scale);

  if (!existsSync(path)) {
    return `No ${path}: run npm run seed:volume -- --scale ${scale} first.`;
  }

  return JSON.parse(readFileSync(path, 'utf8')) as VolumeManifest;
}
