import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import type { Env } from '../../config/env';

type Argon2Options = NonNullable<Parameters<typeof argon2.hash>[1]>;

/**
 * OWASP's baseline for argon2id: 19 MiB of memory, 2 iterations, 1 lane.
 *
 * The memory cost is the point — it is what makes GPU and ASIC attacks scale
 * badly, because thousands of parallel cores cannot each be given 19 MiB.
 * Lowering memoryCost to buy speed defeats the algorithm choice entirely.
 */
const PRODUCTION_OPTIONS: Argon2Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Deliberately weak, for tests only.
 *
 * At production settings each hash costs ~100ms by design. A suite that
 * registers thirty users then spends three seconds hashing, and a slow suite
 * is a suite that stops being run — which costs more security than these
 * parameters do. The test database is separate and truncated between runs, so
 * nothing hashed with these settings outlives the test.
 */
const TEST_OPTIONS: Argon2Options = {
  type: argon2.argon2id,
  memoryCost: 4_096,
  timeCost: 1,
  parallelism: 1,
};

@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);
  private readonly options: Argon2Options;

  constructor(config: ConfigService<Env, true>) {
    const isTest = config.get('NODE_ENV', { infer: true }) === 'test';
    this.options = isTest ? TEST_OPTIONS : PRODUCTION_OPTIONS;

    if (isTest) {
      this.logger.warn('Using reduced password hashing cost (NODE_ENV=test)');
    }
  }

  /**
   * Always the async API. argon2.hashSync would block the event loop for the
   * full ~100ms, freezing every other in-flight request — the one genuine
   * concurrency bug in this module.
   *
   * The salt is generated per call and embedded in the returned string; there
   * is no separate salt column.
   */
  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, this.options);
  }

  /**
   * Returns false rather than throwing on a malformed hash, so a corrupted row
   * reads as "wrong password" instead of a 500 that tells an attacker the
   * account exists.
   */
  async verify(hash: string, plaintext: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plaintext, this.options);
    } catch {
      return false;
    }
  }

  /**
   * True when `hash` was produced with weaker settings than the current ones.
   *
   * Call this after a successful login and rehash if it returns true: login is
   * the only moment the plaintext is available. Without it, raising the cost
   * parameters protects nobody who already has an account, and old weak hashes
   * persist until each user happens to change their password.
   */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.options);
  }
}
