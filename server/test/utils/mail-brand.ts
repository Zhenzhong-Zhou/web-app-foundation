import type { INestApplication } from '@nestjs/common';

import { escapeHtml } from '../../src/shared/mail/escape-html';
import type { Mail } from '../../src/shared/mail/mail.service';
import { MailBrand } from '../../src/shared/mail/mail-brand';

/**
 * The header the product's emails open with (ADR-082): the mark's address
 * and the name as MailBrand reads them from CLIENT_URL and MAIL_FROM, never
 * a literal, so the suite holds whatever name a deployment gives it.
 */
export function mailBrandOf(app: INestApplication): {
  mark: string;
  name: string;
} {
  const { mark, name } = app.get(MailBrand);
  if (!name) {
    throw new Error('MAIL_FROM names no one: give it a name, as .env.example');
  }
  return { mark, name };
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
