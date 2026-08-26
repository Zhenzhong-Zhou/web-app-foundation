import type { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import type { Env } from '../../config/env';
import { PasswordService } from './password.service';

/**
 * A unit test: no database, no HTTP, no Nest application. PasswordService has
 * one dependency and reads it once, so constructing it directly is clearer
 * than a testing module.
 */
describe('PasswordService', () => {
  let service: PasswordService;

  beforeAll(() => {
    // NODE_ENV=test selects the reduced cost parameters, without which each
    // hash below would take ~100ms.
    const config = {
      get: () => 'test',
    } as unknown as ConfigService<Env, true>;

    service = new PasswordService(config);
  });

  it('produces an argon2id hash', async () => {
    const hash = await service.hash('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('salts each hash, so identical passwords do not collide', async () => {
    const [a, b] = await Promise.all([
      service.hash('same-password'),
      service.hash('same-password'),
    ]);

    // A fixed or missing salt would make these equal, which makes the whole
    // password table vulnerable to a single precomputed rainbow table.
    expect(a).not.toBe(b);
    expect(await service.verify(a, 'same-password')).toBe(true);
    expect(await service.verify(b, 'same-password')).toBe(true);
  });

  it('accepts the correct password', async () => {
    const hash = await service.hash('s3cret-password');
    expect(await service.verify(hash, 's3cret-password')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await service.hash('s3cret-password');
    expect(await service.verify(hash, 's3cret-passwerd')).toBe(false);
  });

  it('rejects an empty password against a real hash', async () => {
    const hash = await service.hash('s3cret-password');
    expect(await service.verify(hash, '')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    // A corrupted row must read as "wrong password". Throwing would produce a
    // 500 where a valid login gives 401 — which tells an attacker the account
    // exists.
    expect(await service.verify('not-a-hash', 'anything')).toBe(false);
    expect(await service.verify('', 'anything')).toBe(false);
  });

  it('does not ask to rehash a hash it just produced', async () => {
    const hash = await service.hash('s3cret-password');
    expect(service.needsRehash(hash)).toBe(false);
  });

  it('asks to rehash a hash made with weaker parameters', async () => {
    // Simulates an old hash from before the cost was raised. On login this is
    // the signal to rehash while the plaintext is briefly available.
    const weak = await argon2.hash('s3cret-password', {
      type: argon2.argon2id,
      memoryCost: 1_024,
      timeCost: 1,
      parallelism: 1,
    });

    expect(service.needsRehash(weak)).toBe(true);
    expect(await service.verify(weak, 's3cret-password')).toBe(true);
  });
});
