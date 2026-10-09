import path from 'node:path';

import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import type { FileStorage } from './file-storage';
import { LocalFileStorage } from './local-file-storage';
import { S3FileStorage } from './s3-file-storage';

/** The driver FILE_STORAGE names; env.ts has already checked its settings. */
export function storageFromConfig(
  config: ConfigService<Env, true>,
): FileStorage {
  if (config.get('FILE_STORAGE', { infer: true }) === 'local') {
    return new LocalFileStorage(
      path.resolve(config.get('FILES_LOCAL_DIR', { infer: true })),
    );
  }

  const required = (
    name:
      | 'FILES_S3_ENDPOINT'
      | 'FILES_BUCKET'
      | 'FILES_S3_ACCESS_KEY_ID'
      | 'FILES_S3_SECRET_ACCESS_KEY',
  ): string => {
    const value = config.get(name, { infer: true });
    if (!value) {
      throw new Error(`${name} is required when FILE_STORAGE is s3`);
    }
    return value;
  };

  return new S3FileStorage({
    endpoint: required('FILES_S3_ENDPOINT'),
    region: config.get('FILES_S3_REGION', { infer: true }),
    bucket: required('FILES_BUCKET'),
    accessKeyId: required('FILES_S3_ACCESS_KEY_ID'),
    secretAccessKey: required('FILES_S3_SECRET_ACCESS_KEY'),
  });
}
