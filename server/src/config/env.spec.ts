import { validateEnv } from './env';

/** The settings with no default; everything else falls back. */
const REQUIRED = {
  APP_URL: 'https://api.example.com',
  CLIENT_URL: 'https://app.example.com',
  DATABASE_URL: 'postgres://app:secret@localhost:5432/app',
  MAIL_FROM: 'Foundation <noreply@example.com>',
};

const S3 = {
  FILE_STORAGE: 's3',
  FILES_BUCKET: 'waf-files',
  FILES_S3_ACCESS_KEY_ID: 'key-id',
  FILES_S3_SECRET_ACCESS_KEY: 'secret',
};

/**
 * An endpoint that carries the bucket's name worked, and stored every file
 * under a folder named after the bucket, where the backups did not look.
 * It now fails at boot, saying where the bucket goes.
 */
describe('validateEnv, FILES_S3_ENDPOINT', () => {
  it('takes the account address alone, with or without a trailing slash', () => {
    for (const endpoint of [
      'https://account.r2.cloudflarestorage.com',
      'https://account.r2.cloudflarestorage.com/',
    ]) {
      const env = validateEnv({
        ...REQUIRED,
        ...S3,
        FILES_S3_ENDPOINT: endpoint,
      });

      expect(env.FILES_S3_ENDPOINT).toBe(endpoint);
    }
  });

  it('refuses an address that ends in the bucket, naming FILES_BUCKET', () => {
    expect(() =>
      validateEnv({
        ...REQUIRED,
        ...S3,
        FILES_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com/waf-files',
      }),
    ).toThrow(/FILES_S3_ENDPOINT: .*FILES_BUCKET/);
  });
});
