import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../src/config/env';
import { escapeHtml } from '../../src/shared/mail/escape-html';
import type { Mail } from '../../src/shared/mail/mail.service';
import { appNameOf } from '../../src/shared/mail/mail-brand';

/**
 * The header the product's emails open with (ADR-082): the mark's address
 * from CLIENT_URL, and the name from MAIL_FROM, never a literal, so the
 * suite holds whatever name a deployment gives it.
 */
export function mailBrandOf(app: INestApplication): {
  mark: string;
  name: string;
} {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const name = appNameOf(config.get('MAIL_FROM', { infer: true }));
  if (!name) {
    throw new Error('MAIL_FROM names no one: give it a name, as .env.example');
  }
  return {
    mark: `${config.get('CLIENT_URL', { infer: true })}/brand/mail-mark.png`,
    name,
  };
}

/** Opens with the header, in the HTML and the text alike. */
export function expectMailBrand(
  app: INestApplication,
  mail: Mail | undefined,
): void {
  const { mark, name } = mailBrandOf(app);
  const html = mail?.html ?? '';
  const header = html.slice(0, html.indexOf('<p'));

  expect(header).toContain(`<img src="${mark}" width="28" height="28" alt=""`);
  expect(header).toContain(`>${escapeHtml(name)}</td>`);
  expect(mail?.text.startsWith(`${name}\n\n`)).toBe(true);
}
