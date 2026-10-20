import { parseArgs } from 'node:util';

import { isEmail } from 'class-validator';

import { ORGANIZATION_NAME_MAX_LENGTH } from '../common/dto/account-rules';
import { type Locale, SUPPORTED_LOCALES } from '../common/locales';

/**
 * What `npm run org:invite` was asked to do (ADR-078), and the checks on
 * what it is told, kept apart from the prompts and the database so each
 * is a unit test. Everything here speaks English: only the operator reads
 * it.
 */

export type Command =
  | { kind: 'help' }
  | { kind: 'list' }
  | { kind: 'revoke'; email?: string }
  | { kind: 'issue'; email?: string; name?: string; language?: Locale };

/** A command line or an answer the command cannot use, said as it is. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The three languages, numbered as the prompt offers them. */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  'fr-CA': 'Français',
  'zh-Hans': '简体中文',
};

export const HELP = `Invite someone to set up a new organization, as its Owner (ADR-078).

  npm run org:invite                  asks each question
  npm run org:invite -- --email a@b.example --name "Name"
                        [--language en | fr-CA | zh-Hans]
  npm run org:invite -- --list        waiting, ended and accepted
  npm run org:invite -- --revoke --email a@b.example

On one line, the language is English when --language is left out.
CLIENT_URL and DATABASE_URL may be given on the command line;
otherwise it asks. Neither is ever read from .env. Nothing is emailed:
it prints the link, and a message to send with it.
`;

/** The command line, after `--`. */
export function parseCommand(argv: string[]): Command {
  let values: {
    email?: string;
    name?: string;
    language?: string;
    list?: boolean;
    revoke?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        email: { type: 'string' },
        name: { type: 'string' },
        language: { type: 'string' },
        list: { type: 'boolean' },
        revoke: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    throw new UsageError(
      error instanceof Error ? error.message : String(error),
    );
  }

  if (values.help) return { kind: 'help' };
  if (values.list && values.revoke) {
    throw new UsageError('Choose --list or --revoke, not both.');
  }
  if (values.list) {
    if (values.email || values.name || values.language) {
      throw new UsageError('--list takes nothing else.');
    }
    return { kind: 'list' };
  }
  if (values.revoke) {
    if (values.name || values.language) {
      throw new UsageError('--revoke takes --email alone.');
    }
    return {
      kind: 'revoke',
      email:
        values.email === undefined ? undefined : checkedEmail(values.email),
    };
  }
  // English when left off a command line; asked only on a bare run (ADR-078).
  let language: Locale | undefined;
  if (values.language !== undefined) language = languageFrom(values.language);
  else if (values.email !== undefined || values.name !== undefined) {
    language = 'en';
  }
  return {
    kind: 'issue',
    email: values.email === undefined ? undefined : checkedEmail(values.email),
    name: values.name === undefined ? undefined : checkedName(values.name),
    language,
  };
}

/** An address as registration checks it, lowercased as the table keeps it. */
export function checkedEmail(input: string): string {
  const email = input.trim().toLowerCase();
  if (!isEmail(email) || email.length > 254) {
    throw new UsageError(`"${input.trim()}" is not an email address.`);
  }
  return email;
}

/** An organization's name, within registration's limits. */
export function checkedName(input: string): string {
  const name = input.trim();
  if (name.length < 1 || name.length > ORGANIZATION_NAME_MAX_LENGTH) {
    throw new UsageError(
      `The organization name needs 1 to ${ORGANIZATION_NAME_MAX_LENGTH} characters.`,
    );
  }
  return name;
}

/** A language by its number in the prompt, or by its tag. */
export function languageFrom(input: string): Locale {
  const answer = input.trim();
  const byNumber = SUPPORTED_LOCALES[Number(answer) - 1];
  if (/^\d$/.test(answer) && byNumber) return byNumber;
  const byTag = SUPPORTED_LOCALES.find(
    (tag) => tag.toLowerCase() === answer.toLowerCase(),
  );
  if (byTag) return byTag;
  throw new UsageError(
    `"${answer}" is not a language here: ${SUPPORTED_LOCALES.join(', ')}.`,
  );
}

/** The app's address, the links' start: http or https, no trailing slash. */
export function checkedClientUrl(input: string): string {
  const value = input.trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UsageError(
      `"${value}" is not an address, such as https://app.example.com.`,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new UsageError(`"${value}" must start with https:// or http://.`);
  }
  return value;
}

/** A Postgres connection string. Never printed: it holds the password. */
export function checkedDatabaseUrl(input: string): string {
  const value = input.trim();
  if (!/^postgres(ql)?:\/\/.+/.test(value)) {
    throw new UsageError(
      'That is not a database address: it starts with postgresql://.',
    );
  }
  return value;
}

/** Where the command will write, without the credentials: host / name. */
export function databaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return `${url.hostname} / ${url.pathname.replace(/^\//, '') || '(default)'}`;
}

/** A YYYY-MM-DD day as the command says it: 27 October 2026. */
export function longDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** A YYYY-MM-DD day in a list: 27 Oct 2026. */
export function shortDay(day: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Whether an answer to a [y/N] question is yes; anything else is no. */
export function isYes(answer: string): boolean {
  return /^(y|yes)$/i.test(answer.trim());
}
