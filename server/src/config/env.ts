import { z } from 'zod';

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
    
    DATABASE_URL: z.string().min(1),
    DATABASE_URL_TEST: z.string().min(1),
    
    // 32 bytes base64 ≈ 44 chars. Reject anything short enough to brute force.
    SESSION_SECRET: z
        .string()
        .min(32, 'must be at least 32 characters — generate with `openssl rand -base64 32`'),
    SESSION_MAX_AGE_MS: z.coerce.number().int().positive().default(604_800_000),
    
    MAIL_HOST: z.string().default('localhost'),
    MAIL_PORT: z.coerce.number().int().positive().default(1025),
    // NOT z.coerce.boolean(): Boolean('false') === true, which silently
    // enables TLS when the env file explicitly disables it.
    MAIL_SECURE: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
    MAIL_FROM: z.string().min(1),
    
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Passed to ConfigModule.forRoot({ validate }). Throwing here aborts boot,
 * which is the whole point: a missing SESSION_SECRET should fail at startup,
 * not at the first login attempt in production.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
    const parsed = envSchema.safeParse(raw);
    
    if (!parsed.success) {
        const issues = parsed.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    
    return parsed.data;
}