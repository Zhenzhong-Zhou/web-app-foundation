import { createInterface, type Interface } from 'node:readline/promises';
import { Writable } from 'node:stream';

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { type Locale, SUPPORTED_LOCALES } from '../common/locales';
import {
  belongsToAnOrganization,
  issueOrganizationInvitation,
  type ListedInvitation,
  listOrganizationInvitations,
  organizationInvitationMessage,
  OrganizationInvitationRefused,
  organizationLinkLastDay,
  revokeOrganizationInvitation,
  waitingFor,
} from '../core/invitations/organization-invitations';
import type { Database } from '../database/database.module';
import * as schema from '../database/schema';
import {
  checkedClientUrl,
  checkedDatabaseUrl,
  checkedEmail,
  checkedName,
  type Command,
  databaseTarget,
  HELP,
  isYes,
  LANGUAGE_NAMES,
  languageFrom,
  longDay,
  parseCommand,
  shortDay,
  UsageError,
} from './org-invite-options';

/**
 * `npm run org:invite` (ADR-078): the operator invites someone to set up a
 * new organization, from a laptop, against the production database, since
 * Render's free services have no shell. Run bare, it asks each question,
 * so the only thing to remember is the command.
 *
 * It reads only its own process's environment, never `.env`: a setting
 * left off is asked for, never quietly taken from the development
 * database, the trap drizzle.config.ts records. The database's address,
 * which holds its password, is asked for without echoing it, so it does
 * not stay in the shell's history. It shows where it will write and asks
 * before writing. It sends no mail: it prints the link, and a message in
 * the invitation's language to send with it.
 *
 * It boots no Nest application, so no timer starts and no other setting
 * is needed: one connection, and the plain functions the operator's
 * console will call too.
 */

class Cancelled extends Error {}

const out = (text = ''): void => {
  process.stdout.write(`${text}\n`);
};
const fail = (text: string): void => {
  process.stderr.write(`${text}\n`);
};

/**
 * The screen the questions are asked on, silenced while the database's
 * address is typed, so readline's echo of it never shows.
 */
class Screen extends Writable {
  silent = false;

  /** The terminal's width, which readline wraps a long answer at. */
  get columns(): number | undefined {
    return process.stdout.columns;
  }

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    done: () => void,
  ): void {
    if (!this.silent) process.stdout.write(chunk);
    done();
  }
}

const screen = new Screen();

/** Whether a person types the answers at a terminal, rather than a pipe. */
const atTerminal = process.stdin.isTTY === true;

/**
 * One reader for the whole run, opened at the first question: piped
 * answers are read one per question, never lost between two. Readline
 * edits and echoes a line only at a terminal; a piped answer is never
 * shown. Ctrl-C, Ctrl-D or the end of the input closes it, and a question
 * left without an answer then cancels the run.
 */
let reader:
  | { lines: Interface; answers: AsyncIterator<string>; closed: boolean }
  | undefined;

function openReader(): NonNullable<typeof reader> {
  const lines = createInterface({
    input: process.stdin,
    output: screen,
    terminal: atTerminal,
  });
  const opened = {
    lines,
    answers: lines[Symbol.asyncIterator](),
    closed: false,
  };
  lines.on('close', () => {
    opened.closed = true;
  });
  lines.on('SIGINT', () => lines.close());
  return opened;
}

/**
 * One question, answered on its line. A hidden one, the database's
 * address, is not shown as it is typed or pasted.
 */
async function ask(question: string, hidden = false): Promise<string> {
  reader ??= openReader();
  // At a terminal readline draws the question, to redraw the line as it
  // is edited. Otherwise it is written here: piped answers may all have
  // been read, and the reader closed, before the last question.
  const drawn = atTerminal && !reader.closed;
  const silenced = hidden && drawn;
  if (drawn) {
    if (silenced) {
      process.stdout.write(question);
      screen.silent = true;
    }
    reader.lines.setPrompt(silenced ? '' : question);
    reader.lines.prompt();
  } else {
    process.stdout.write(question);
  }
  try {
    const answer = await reader.answers.next();
    if (answer.done) throw new Cancelled();
    return answer.value.trim();
  } finally {
    if (silenced) {
      screen.silent = false;
      out();
    }
  }
}

/** One question, asked again until its answer passes `check`. */
async function askUntil<T>(
  question: string,
  check: (answer: string) => T,
  hidden = false,
): Promise<T> {
  for (;;) {
    try {
      return check(await ask(question, hidden));
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      fail(error.message);
    }
  }
}

async function askLanguage(): Promise<Locale> {
  out('Language');
  SUPPORTED_LOCALES.forEach((tag, index) =>
    out(`  ${index + 1}  ${LANGUAGE_NAMES[tag]}`),
  );
  return askUntil('Choose 1, 2 or 3 [1]: ', (answer) =>
    languageFrom(answer || '1'),
  );
}

/** A setting from this process's environment only, empty as unset. */
function fromEnvironment(name: 'CLIENT_URL' | 'DATABASE_URL'): string | null {
  return process.env[name]?.trim() || null;
}

/** What each command needs from the person, all of it asked before connecting. */
type Asked =
  | { kind: 'list' }
  | { kind: 'revoke'; email: string }
  | {
      kind: 'issue';
      email: string;
      name: string;
      language: Locale;
      clientUrl: string;
    };

async function askFor(
  command: Exclude<Command, { kind: 'help' }>,
): Promise<Asked> {
  if (command.kind === 'list') return command;
  if (command.kind === 'revoke') {
    return {
      kind: 'revoke',
      email:
        command.email ??
        (await askUntil('Email of the invitation to revoke: ', checkedEmail)),
    };
  }
  const email =
    command.email ??
    (await askUntil('Email of the person who sets it up: ', checkedEmail));
  const name =
    command.name ?? (await askUntil('Organization name: ', checkedName));
  const language = command.language ?? (await askLanguage());
  const given = fromEnvironment('CLIENT_URL');
  const clientUrl = given
    ? checkedClientUrl(given)
    : await askUntil('App address (CLIENT_URL): ', checkedClientUrl);
  return { kind: 'issue', email, name, language, clientUrl };
}

function printTarget(lines: [string, string][]): void {
  out();
  for (const [label, value] of lines) out(`  ${label.padEnd(10)} ${value}`);
  out();
}

function printList(
  title: string,
  rows: ListedInvitation[],
  day: string,
  hint?: string,
): void {
  out(title);
  if (rows.length === 0) {
    out('  none');
    return;
  }
  const emailWidth = Math.max(...rows.map((row) => row.email.length));
  const nameWidth = Math.max(...rows.map((row) => row.organizationName.length));
  for (const row of rows) {
    out(
      `  ${row.email.padEnd(emailWidth)}   ${row.organizationName.padEnd(nameWidth)}   ${day} ${shortDay(row.day)}`,
    );
    if (hint) out(`  ${' '.repeat(emailWidth)}   ${hint}`);
  }
}

async function list(db: Database, target: string): Promise<number> {
  const listed = await listOrganizationInvitations(db);
  printTarget([['Database', target]]);
  printList('Waiting', listed.waiting, 'until');
  printList(
    'Ended, not accepted',
    listed.ended,
    'ended',
    'run again to send a new link',
  );
  printList('Accepted', listed.accepted, 'on');
  return 0;
}

async function revoke(
  db: Database,
  target: string,
  email: string,
): Promise<number> {
  const waiting = await waitingFor(db, email);
  if (!waiting) {
    out(`Nothing is waiting for ${email}. Nothing was written.`);
    return 1;
  }
  printTarget([
    ['Database', target],
    ['Address', waiting.email],
    ['Name', waiting.organizationName],
  ]);
  if (!isYes(await ask(`Revoke the invitation for ${email}? [y/N] `))) {
    out('Nothing was written.');
    return 0;
  }
  if (!(await revokeOrganizationInvitation(db, email))) {
    out(
      `Nothing is waiting for ${email} any more: it was accepted or revoked meanwhile. Nothing was written.`,
    );
    return 1;
  }
  out('Revoked. Its link no longer works.');
  return 0;
}

async function issue(
  db: Database,
  target: string,
  { email, name, language, clientUrl }: Extract<Asked, { kind: 'issue' }>,
): Promise<number> {
  if (await belongsToAnOrganization(db, email)) {
    fail(`${email} already belongs to an organization.`);
    fail('For now an account belongs to one. Nothing was written.');
    return 1;
  }

  printTarget([
    ['Database', target],
    ['App', clientUrl],
    ['Address', email],
    ['Name', name],
    ['Language', LANGUAGE_NAMES[language]],
  ]);

  const waiting = await waitingFor(db, email);
  const question = waiting
    ? `${email} already has an invitation, until the end of ${longDay(organizationLinkLastDay(waiting.expiresAt))}. Replace it? Its link stops working, and a new one starts its 7 days. [y/N] `
    : 'Write this invitation to that database? [y/N] ';
  if (!isYes(await ask(question))) {
    out('Nothing was written.');
    return 0;
  }

  const issued = await issueOrganizationInvitation(
    db,
    { email, organizationName: name, locale: language },
    clientUrl,
  );

  out();
  out(
    `${issued.replaced ? 'Invitation replaced' : 'Invitation made'}. It works until the end of ${longDay(issued.lastDay)},`,
  );
  out('wherever they are. Nothing was emailed.');
  out();
  out('Link');
  out(`  ${issued.link}`);
  out();
  out(`Message to send, in ${LANGUAGE_NAMES[language]}`);
  out(`  ${organizationInvitationMessage(language, name, issued.lastDay)}`);
  out(`  ${issued.link}`);
  return 0;
}

async function main(argv: string[]): Promise<number> {
  let command: Command;
  try {
    command = parseCommand(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    fail(error.message);
    fail('Run npm run org:invite -- --help to see what it takes.');
    return 2;
  }
  if (command.kind === 'help') {
    out(HELP);
    return 0;
  }

  const asked = await askFor(command);
  const givenDatabase = fromEnvironment('DATABASE_URL');
  const databaseUrl = givenDatabase
    ? checkedDatabaseUrl(givenDatabase)
    : await askUntil(
        'Production database (External URL, hidden as you type): ',
        checkedDatabaseUrl,
        true,
      );

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
    connectionTimeoutMillis: 10_000,
  });
  const db: Database = drizzle(pool, { schema });

  try {
    const { rows } = await db.execute<{ ready: boolean }>(
      sql`select to_regclass('public.organization_invitations') is not null as ready`,
    );
    if (!rows[0]?.ready) {
      fail(
        'This database has no organization invitations yet: its migrations stop before 0069.',
      );
      fail('Deploy, then run this again. Nothing was written.');
      return 1;
    }

    const target = databaseTarget(databaseUrl);
    switch (asked.kind) {
      case 'list':
        return await list(db, target);
      case 'revoke':
        return await revoke(db, target, asked.email);
      case 'issue':
        return await issue(db, target, asked);
    }
  } catch (error) {
    if (error instanceof OrganizationInvitationRefused) {
      fail(error.message);
      fail('Nothing was written.');
      return 1;
    }
    throw error;
  } finally {
    await pool.end();
  }
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    if (error instanceof Cancelled) {
      fail('Cancelled. Nothing was written.');
      process.exitCode = 130;
      return;
    }
    fail(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  // The reader holds the input open, and the terminal in raw mode.
  .finally(() => reader?.lines.close());
