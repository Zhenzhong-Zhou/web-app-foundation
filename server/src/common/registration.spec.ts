import { operatorEmail, registrationMode } from './registration';

/** ADR-078: what each setting means, set and unset. */
describe('registrationMode', () => {
  it('follows REGISTRATION when it is set', () => {
    expect(
      registrationMode({ NODE_ENV: 'production', REGISTRATION: 'open' }),
    ).toBe('open');
    expect(
      registrationMode({ NODE_ENV: 'development', REGISTRATION: 'invitation' }),
    ).toBe('invitation');
  });

  it('is by invitation in production when unset, so a forgotten setting fails closed', () => {
    expect(registrationMode({ NODE_ENV: 'production' })).toBe('invitation');
  });

  it('is open everywhere else when unset', () => {
    expect(registrationMode({ NODE_ENV: 'development' })).toBe('open');
    expect(registrationMode({ NODE_ENV: 'test' })).toBe('open');
    expect(registrationMode({})).toBe('open');
  });
});

describe('operatorEmail', () => {
  it('is the address when set, and null when unset or empty', () => {
    expect(operatorEmail({ OPERATOR_EMAIL: 'ops@example.com' })).toBe(
      'ops@example.com',
    );
    expect(operatorEmail({})).toBeNull();
    expect(operatorEmail({ OPERATOR_EMAIL: '  ' })).toBeNull();
  });
});
