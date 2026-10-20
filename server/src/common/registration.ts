/**
 * Who may create an organization themselves (ADR-078): anyone, from the
 * sign-up form and, for an account with no organization, from Home; or
 * nobody, every new organization coming from an organization invitation
 * the operator issues.
 */
export const REGISTRATION_MODES = ['open', 'invitation'] as const;

export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

/**
 * REGISTRATION, read when a request needs it rather than at boot, so a
 * spec can switch it without rebuilding the app, as calendarDayInput()
 * does; the env schema still validates the value at boot, which is what
 * catches a typo. Left unset it is `invitation` in production and `open`
 * everywhere else: a production deployment that forgets it fails closed,
 * and development, CI and both test suites need no change.
 */
export function registrationMode(
  env: NodeJS.ProcessEnv = process.env,
): RegistrationMode {
  const set = env.REGISTRATION;
  if (set === 'open' || set === 'invitation') return set;
  return env.NODE_ENV === 'production' ? 'invitation' : 'open';
}

/**
 * OPERATOR_EMAIL, read when an organization invitation is accepted
 * (ADR-078), for the same reason: the address told of each acceptance, or
 * null to tell nobody. Validated at boot by the env schema.
 */
export function operatorEmail(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return env.OPERATOR_EMAIL?.trim() || null;
}
