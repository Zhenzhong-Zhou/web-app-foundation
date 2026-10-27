import type { ConfigService } from '@nestjs/config';

import type { Env } from './env';

/**
 * A ConfigService answering from the settings given, the rest unset: for
 * what is built outside a Nest application, as a command line tool or a
 * unit test builds a service.
 */
export function configOf(settings: Partial<Env>): ConfigService<Env, true> {
  return {
    get: (key: keyof Env) => settings[key],
  } as unknown as ConfigService<Env, true>;
}
