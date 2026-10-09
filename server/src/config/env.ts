import { z } from 'zod';

import { CALENDAR_DAY_INPUTS } from '../common/dto/calendar-day';

/**
 * The single source of truth for environment configuration.
 *
 * Every variable the app reads must appear here. If it isn't in this schema,
 * it doesn't exist as far as the app is concerned — that is the point.
 */
export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_URL: z.url(),
  CLIENT_URL: z.url(),

  DATABASE_URL: z.url(),
  // Optional: absent in every environment except a test run. The pool factory
  // is what actually requires it, and only when NODE_ENV=test.
  DATABASE_URL_TEST: z.url().optional(),

  // Absolute cap: a stolen token cannot be kept alive indefinitely by use.
  SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(2_592_000_000), // 30d
  // Idle timeout: an abandoned session dies even within the absolute window.
  SESSION_IDLE_MS: z.coerce.number().int().positive().default(604_800_000), // 7d
  // 24h: a verification link sits in an inbox and may not be clicked today.
  VERIFICATION_TOKEN_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(86_400_000),
  // 1h: a reset token is a live credential for taking over the account, so it
  // gets the shortest life that still tolerates a slow inbox.
  PASSWORD_RESET_TOKEN_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(3_600_000),

  MAIL_HOST: z.string().default('localhost'),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  // NOT z.coerce.boolean(): Boolean('false') === true, which silently
  // enables TLS when the env file explicitly disables it.
  MAIL_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_FROM: z.string().min(1),
  // Present in production, absent locally. Its presence selects the HTTP
  // transport — see MailService.
  RESEND_API_KEY: z.string().optional(),

  // ADR-052: whether a calendar day may also arrive as an instant at exactly
  // UTC midnight, the shape clients sent before it. Strict unless a
  // deployment opts in for a transition or an integration that sends
  // instants. Read per request by IsCalendarDay(); declared here so a typo
  // fails at boot rather than silently meaning strict.
  CALENDAR_DAY_INPUT: z.enum(CALENDAR_DAY_INPUTS).default('strict'),

  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),

  // Files (ADR-059). `local` keeps them on disk, for development, tests and
  // CI; `s3` in a bucket, which needs the five FILES_S3_* and FILES_BUCKET.
  FILE_STORAGE: z.enum(['local', 's3']).default('local'),
  FILES_LOCAL_DIR: z.string().min(1).default('storage'),
  FILES_S3_ENDPOINT: z.url().optional(),
  FILES_S3_REGION: z.string().min(1).default('auto'),
  FILES_BUCKET: z.string().min(1).optional(),
  FILES_S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  FILES_S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  // Every file and every size an organization keeps, together: 1 GB.
  FILES_ORG_LIMIT_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(1_073_741_824),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule.forRoot({ validate }). Throwing here aborts boot,
 * which is the whole point: a missing DATABASE_URL should fail at startup, not
 * at the first request in production.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  // A bucket without its address or keys would fail at the first upload,
  // in production; here it fails at boot.
  if (parsed.data.FILE_STORAGE === 's3') {
    const missing = S3_SETTINGS.filter((name) => !parsed.data[name]);
    if (missing.length > 0) {
      throw new Error(
        `Invalid environment configuration:\n${missing
          .map((name) => `  - ${name}: required when FILE_STORAGE is s3`)
          .join('\n')}`,
      );
    }
  }

  return parsed.data;
}

const S3_SETTINGS = [
  'FILES_S3_ENDPOINT',
  'FILES_BUCKET',
  'FILES_S3_ACCESS_KEY_ID',
  'FILES_S3_SECRET_ACCESS_KEY',
] as const;
