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

/**
 * ADR-078's two settings: a typo in either fails at boot, rather than
 * quietly meaning the default or telling nobody.
 */
describe('validateEnv, REGISTRATION and OPERATOR_EMAIL', () => {
  it('takes open or invitation, and leaves REGISTRATION unset when it is', () => {
    expect(
      validateEnv({ ...REQUIRED, REGISTRATION: 'open' }).REGISTRATION,
    ).toBe('open');
    expect(
      validateEnv({ ...REQUIRED, REGISTRATION: 'invitation' }).REGISTRATION,
    ).toBe('invitation');
    expect(validateEnv(REQUIRED).REGISTRATION).toBeUndefined();
  });

  it('refuses any other REGISTRATION, naming it', () => {
    expect(() => validateEnv({ ...REQUIRED, REGISTRATION: 'closed' })).toThrow(
      /REGISTRATION/,
    );
  });

  it('takes an address for OPERATOR_EMAIL, and counts empty as unset', () => {
    expect(
      validateEnv({ ...REQUIRED, OPERATOR_EMAIL: 'ops@example.com' })
        .OPERATOR_EMAIL,
    ).toBe('ops@example.com');
    expect(
      validateEnv({ ...REQUIRED, OPERATOR_EMAIL: '' }).OPERATOR_EMAIL,
    ).toBeUndefined();
  });

  it('refuses an OPERATOR_EMAIL that is not an address, naming it', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, OPERATOR_EMAIL: 'ops-at-example' }),
    ).toThrow(/OPERATOR_EMAIL/);
  });
});

/**
 * ADR-011, amended for #316: a header's name, so a value that cannot be
 * one, such as the address itself, fails at boot.
 */
describe('validateEnv, CLIENT_IP_HEADER', () => {
  it('takes a header name, lowercased, and counts empty as unset', () => {
    expect(
      validateEnv({ ...REQUIRED, CLIENT_IP_HEADER: 'CF-Connecting-IP' })
        .CLIENT_IP_HEADER,
    ).toBe('cf-connecting-ip');
    expect(
      validateEnv({ ...REQUIRED, CLIENT_IP_HEADER: '' }).CLIENT_IP_HEADER,
    ).toBeUndefined();
  });

  it('refuses a value that is not a header name, naming it', () => {
    expect(() =>
      validateEnv({ ...REQUIRED, CLIENT_IP_HEADER: '203.0.113.7' }),
    ).toThrow(/CLIENT_IP_HEADER/);
  });
});

/**
 * ADR-084: read by the error tracker's own parser, so an address it cannot
 * read fails at boot, naming the setting, rather than a tracker said to be
 * on that reaches nothing.
 */
describe('validateEnv, ERROR_TRACKER_DSN', () => {
  afterEach(() => vi.restoreAllMocks());

  it("takes a project's address, and counts empty as unset", () => {
    const dsn = 'https://publickey@o1.ingest.example.invalid/42';

    expect(
      validateEnv({ ...REQUIRED, ERROR_TRACKER_DSN: dsn }).ERROR_TRACKER_DSN,
    ).toBe(dsn);
    expect(
      validateEnv({ ...REQUIRED, ERROR_TRACKER_DSN: '' }).ERROR_TRACKER_DSN,
    ).toBeUndefined();
  });

  it.each([
    ['no key', 'https://o1.ingest.example.invalid/42'],
    ['no project', 'https://publickey@o1.ingest.example.invalid'],
    ['a project that is not a number', 'https://publickey@example.invalid/x'],
    ['another protocol', 'ftp://publickey@o1.ingest.example.invalid/42'],
  ])('refuses an address with %s, naming it', (_case, dsn) => {
    // The SDK prints an address its pattern cannot read.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => validateEnv({ ...REQUIRED, ERROR_TRACKER_DSN: dsn })).toThrow(
      /ERROR_TRACKER_DSN: the project's address/,
    );
  });
});
