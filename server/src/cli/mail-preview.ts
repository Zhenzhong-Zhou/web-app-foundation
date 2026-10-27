import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';

import { configOf } from '../config/config-of';
import { envSchema } from '../config/env';
import { escapeHtml } from '../shared/mail/escape-html';
import { MailService } from '../shared/mail/mail.service';
import { type MailSample, mailSamples } from './mail/mail-samples';

/**
 * `npm run mail:preview` (ADR-083): every email the app sends, in each
 * language it is sent in, written as HTML and text into tmp/mail-preview/
 * with an index page linking them. `npm run mail:preview -- --send`
 * delivers them all to Mailpit as well, for its HTML Check and a phone.
 *
 * From mail-samples.ts's fixed values, so it needs no database, and it
 * boots no Nest application, as org:invite doesn't. Sending reads ../.env
 * for Mailpit's address, as the dev server does, and refuses when
 * RESEND_API_KEY is set there or in the process: it never sends real mail.
 */

const FOLDER = join(__dirname, '..', '..', '..', 'tmp', 'mail-preview');
const USAGE = 'Usage: npm run mail:preview [-- --send]';

/**
 * A byte-order mark: a browser opening the file reads it as UTF-8, which
 * nothing in an HTML fragment or a text file declares, so the Chinese
 * emails show as written.
 */
const BOM = '\uFEFF';

async function main(args: string[]): Promise<number> {
  const send = args.includes('--send');
  if (args.some((arg) => arg !== '--send')) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  // MailBrand's "the mark answers" and MailService's "Sent" lines: this
  // says what it did itself.
  Logger.overrideLogger(['warn', 'error']);

  const samples = await mailSamples();
  write(samples);
  process.stdout.write(
    `Wrote ${samples.length} emails to ${join(FOLDER, 'index.html')}\n`,
  );

  return send ? deliver(samples) : 0;
}

function write(samples: MailSample[]): void {
  rmSync(FOLDER, { recursive: true, force: true });
  mkdirSync(FOLDER, { recursive: true });
  for (const { name, locale, mail } of samples) {
    writeFileSync(join(FOLDER, `${name}.${locale}.html`), BOM + mail.html);
    writeFileSync(join(FOLDER, `${name}.${locale}.txt`), BOM + mail.text);
  }
  writeFileSync(join(FOLDER, 'index.html'), index(samples));
}

/** A row for each email, a column for each language, its subject linked. */
function index(samples: MailSample[]): string {
  const locales = [...new Set(samples.map((sample) => sample.locale))];
  const names = [...new Set(samples.map((sample) => sample.name))];
  const cell = (name: string, locale: string) => {
    const sample = samples.find(
      (each) => each.name === name && each.locale === locale,
    );
    if (!sample) return '<td></td>';
    const file = `${name}.${locale}`;
    return `<td><a href="${file}.html">${escapeHtml(sample.mail.subject)}</a> · <a href="${file}.txt">text</a></td>`;
  };
  const rows = names.map(
    (name) =>
      `<tr><th scope="row">${name}</th>${locales.map((locale) => cell(name, locale)).join('')}</tr>`,
  );
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<meta charset="utf-8">',
    '<title>Mail preview</title>',
    '<style>body{font-family:system-ui,sans-serif;margin:24px}th,td{text-align:left;vertical-align:top;padding:6px 12px 6px 0}</style>',
    '<h1>Mail preview</h1>',
    '<table>',
    `<tr><th></th>${locales.map((locale) => `<th scope="col">${locale}</th>`).join('')}</tr>`,
    ...rows,
    '</table>',
    '',
  ].join('\n');
}

/** Every sample to Mailpit, over SMTP; never over Resend. */
async function deliver(samples: MailSample[]): Promise<number> {
  try {
    process.loadEnvFile(join(__dirname, '..', '..', '..', '.env'));
  } catch {
    // No .env: the process's own settings, else Mailpit's defaults.
  }
  if (process.env.RESEND_API_KEY) {
    process.stderr.write(
      'RESEND_API_KEY is set, so --send would send real mail through Resend. Unset it, in the shell and in .env, to send to Mailpit.\n',
    );
    return 1;
  }

  const settings = envSchema
    .pick({
      MAIL_HOST: true,
      MAIL_PORT: true,
      MAIL_SECURE: true,
      MAIL_FROM: true,
    })
    .parse(process.env);
  const mail = new MailService(configOf(settings));

  try {
    for (const sample of samples) await mail.send(sample.mail);
  } catch (error) {
    process.stderr.write(
      `Could not send to ${settings.MAIL_HOST}:${settings.MAIL_PORT}: ${String(error)}. Is Mailpit running? docker compose up -d\n`,
    );
    return 1;
  } finally {
    mail.onModuleDestroy();
  }
  process.stdout.write(
    `Sent ${samples.length} emails to ${settings.MAIL_HOST}:${settings.MAIL_PORT}\n`,
  );
  return 0;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
