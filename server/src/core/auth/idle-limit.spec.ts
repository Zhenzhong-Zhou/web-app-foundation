import { idleLimitOf } from './session-context.middleware';

const HOUR = 60 * 60 * 1000;

describe('idleLimitOf (ADR-065)', () => {
  const off = {
    idleSignOutMinutes: null,
    idleSignOutScope: 'unticked' as const,
  };
  const unticked = (minutes: number) => ({
    idleSignOutMinutes: minutes,
    idleSignOutScope: 'unticked' as const,
  });
  const everyone = (minutes: number) => ({
    idleSignOutMinutes: minutes,
    idleSignOutScope: 'everyone' as const,
  });

  it('leaves a kept session alone with no policy', () => {
    expect(idleLimitOf({ keepSignedIn: true }, off)).toBeNull();
    expect(idleLimitOf({ keepSignedIn: true })).toBeNull();
  });

  it('holds a session not kept to two hours', () => {
    expect(idleLimitOf({ keepSignedIn: false }, off)).toBe(2 * HOUR);
  });

  it('applies a policy for sessions not kept to those only', () => {
    expect(idleLimitOf({ keepSignedIn: true }, unticked(15))).toBeNull();
    expect(idleLimitOf({ keepSignedIn: false }, unticked(15))).toBe(
      15 * 60_000,
    );
  });

  it('applies a policy for everyone to everyone, and only ever shortens', () => {
    expect(idleLimitOf({ keepSignedIn: true }, everyone(30))).toBe(30 * 60_000);
    // Four hours would lengthen an unkept session's two: two it stays.
    expect(idleLimitOf({ keepSignedIn: false }, everyone(240))).toBe(2 * HOUR);
  });
});
