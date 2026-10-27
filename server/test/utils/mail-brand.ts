import type { INestApplication } from '@nestjs/common';

import type { Mail } from '../../src/shared/mail/mail.service';
import { MailBrand } from '../../src/shared/mail/mail-brand';
import { blockHtml, type MailBlock } from '../../src/shared/mail/mail-layout';

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

/**
 * Opens with the header, the mark in it, which the suite answers as
 * served, in the HTML and the text alike, and in the HTML its subject as
 * its heading after it (ADR-083): the blocks as the layout draws them,
 * whose markup the layout's spec alone pins.
 */
export function expectMailBrand(
  app: INestApplication,
  mail: Mail | undefined,
): void {
  const { mark, name } = mailBrandOf(app);
  expectBlocksInOrder(mail?.html ?? '', [
    { kind: 'header', name, mark },
    { kind: 'heading', text: mail?.subject ?? '' },
  ]);
  // First, before anything the email says: both parts come from the same
  // blocks.
  expect(mail?.text.startsWith(`${name}\n\n`)).toBe(true);
}

/** Each block drawn in the HTML, after the one before. */
export function expectBlocksInOrder(html: string, blocks: MailBlock[]): void {
  let from = 0;
  for (const block of blocks) {
    const drawn = blockHtml(block, 'en');
    const at = html.indexOf(drawn, from);
    expect(at, `${block.kind} after the blocks before it`).toBeGreaterThan(-1);
    from = at + drawn.length;
  }
}
