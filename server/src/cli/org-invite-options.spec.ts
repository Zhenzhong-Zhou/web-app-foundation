import {
  checkedClientUrl,
  checkedDatabaseUrl,
  checkedEmail,
  checkedName,
  databaseTarget,
  isYes,
  languageFrom,
  longDay,
  parseCommand,
  shortDay,
  UsageError,
} from './org-invite-options';

/** npm run org:invite's command line and answers (ADR-078). */
describe('parseCommand', () => {
  it('asks for everything when run bare', () => {
    expect(parseCommand([])).toEqual({
      kind: 'issue',
      email: undefined,
      name: undefined,
      language: undefined,
    });
  });

  it('takes the same answers on one line, the address lowercased', () => {
    expect(
      parseCommand([
        '--email',
        'Chen.Jie@HarbourHerbs.example',
        '--name',
        ' Harbour Herbs ',
        '--language',
        'zh-hans',
      ]),
    ).toEqual({
      kind: 'issue',
      email: 'chen.jie@harbourherbs.example',
      name: 'Harbour Herbs',
      language: 'zh-Hans',
    });
  });

  it('takes English on one line when --language is left out', () => {
    const english = { kind: 'issue', language: 'en' };
    expect(
      parseCommand(['--email', 'a@b.example', '--name', 'X']),
    ).toMatchObject(english);
    expect(parseCommand(['--name', 'X'])).toMatchObject(english);
    expect(parseCommand(['--email', 'a@b.example'])).toMatchObject(english);
    expect(parseCommand(['--language', 'fr-CA'])).toMatchObject({
      language: 'fr-CA',
    });
  });

  it('reads --help, --list and --revoke', () => {
    expect(parseCommand(['--help'])).toEqual({ kind: 'help' });
    expect(parseCommand(['-h'])).toEqual({ kind: 'help' });
    expect(parseCommand(['--list'])).toEqual({ kind: 'list' });
    expect(parseCommand(['--revoke', '--email', 'a@b.example'])).toEqual({
      kind: 'revoke',
      email: 'a@b.example',
    });
    expect(parseCommand(['--revoke'])).toEqual({
      kind: 'revoke',
      email: undefined,
    });
  });

  it('refuses what it cannot use, saying why', () => {
    expect(() => parseCommand(['--list', '--revoke'])).toThrow(UsageError);
    expect(() => parseCommand(['--list', '--email', 'a@b.example'])).toThrow(
      '--list takes nothing else.',
    );
    expect(() => parseCommand(['--revoke', '--name', 'X'])).toThrow(
      '--revoke takes --email alone.',
    );
    expect(() => parseCommand(['--emial', 'a@b.example'])).toThrow(UsageError);
    expect(() => parseCommand(['stray'])).toThrow(UsageError);
  });
});

describe('the answers', () => {
  it('takes an address, and refuses what is not one', () => {
    expect(checkedEmail(' A@B.example ')).toBe('a@b.example');
    expect(() => checkedEmail('a-at-b')).toThrow(
      '"a-at-b" is not an email address.',
    );
  });

  it('takes a name of 1 to 100 characters', () => {
    expect(checkedName('  青禾贸易 ')).toBe('青禾贸易');
    expect(() => checkedName('   ')).toThrow(UsageError);
    expect(() => checkedName('x'.repeat(101))).toThrow(UsageError);
  });

  it('takes a language by its number or its tag', () => {
    expect(languageFrom('1')).toBe('en');
    expect(languageFrom('2')).toBe('fr-CA');
    expect(languageFrom('3')).toBe('zh-Hans');
    expect(languageFrom('FR-ca')).toBe('fr-CA');
    expect(() => languageFrom('4')).toThrow(UsageError);
    expect(() => languageFrom('de')).toThrow(UsageError);
  });

  it('takes the app’s address without a trailing slash', () => {
    expect(checkedClientUrl('https://app.example.com/')).toBe(
      'https://app.example.com',
    );
    expect(checkedClientUrl('http://localhost:5173')).toBe(
      'http://localhost:5173',
    );
    expect(() => checkedClientUrl('app.example.com')).toThrow(UsageError);
    expect(() => checkedClientUrl('ftp://app.example.com')).toThrow(UsageError);
  });

  it('takes a database address, and names it without its password', () => {
    const url =
      'postgresql://app:secret@dpg-1.oregon-postgres.render.com/foundation?sslmode=no-verify';
    expect(checkedDatabaseUrl(` ${url} `)).toBe(url);
    expect(databaseTarget(url)).toBe(
      'dpg-1.oregon-postgres.render.com / foundation',
    );
    expect(databaseTarget(url)).not.toContain('secret');
    expect(() => checkedDatabaseUrl('mysql://x')).toThrow(UsageError);
  });

  it('says days in English, long and short', () => {
    expect(longDay('2026-10-27')).toBe('27 October 2026');
    expect(shortDay('2026-10-27')).toBe('27 Oct 2026');
  });

  it('takes y or yes as yes, and anything else as no', () => {
    expect(isYes('y')).toBe(true);
    expect(isYes(' YES ')).toBe(true);
    expect(isYes('')).toBe(false);
    expect(isYes('n')).toBe(false);
    expect(isYes('yep')).toBe(false);
  });
});
