import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { appNameOf, MailBrand } from './mail-brand';

/** The footer names who sends it, and never shows an address (ADR-077). */
describe('appNameOf', () => {
  it('reads the display name MAIL_FROM gives its address', () => {
    expect(appNameOf('Panivo <no-reply@example.com>')).toBe('Panivo');
    expect(appNameOf('"Northside Tools" <no-reply@example.com>')).toBe(
      'Northside Tools',
    );
  });

  it('is null for an address with no name', () => {
    expect(appNameOf('no-reply@example.com')).toBeNull();
    expect(appNameOf('<no-reply@example.com>')).toBeNull();
  });
});

/** The header the product's emails open with (ADR-082). */
describe('MailBrand', () => {
  const MAIL = {
    to: 'mei.lin@example.com',
    subject: 'Confirm your email address',
    text: 'Hi Mei Lin,',
    html: '<p>Hi Mei Lin,</p>',
  };

  function brand(mailFrom: string): MailBrand {
    const settings: Partial<Env> = {
      MAIL_FROM: mailFrom,
      CLIENT_URL: 'https://app.example.com',
    };
    const config = {
      get: (key: keyof Env) => settings[key],
    } as unknown as ConfigService<Env, true>;
    return new MailBrand(config);
  }

  it('opens with the mark from CLIENT_URL and the name beside it', () => {
    const mail = brand('Panivo <no-reply@example.com>').withHeader(MAIL);

    expect(mail.html).toMatch(/^<table role="presentation"/);
    expect(mail.html).toContain(
      '<img src="https://app.example.com/brand/mail-mark.png" width="28" height="28" alt=""',
    );
    expect(mail.html).toContain('>Panivo</td>');
    expect(mail.html.endsWith('\n<p>Hi Mei Lin,</p>')).toBe(true);
    expect(mail.text).toBe('Panivo\n\nHi Mei Lin,');
    expect(mail.subject).toBe(MAIL.subject);
  });

  it('escapes the name, set by whoever deploys it', () => {
    const { html } = brand('Tools & Co <no-reply@example.com>').withHeader(
      MAIL,
    );

    expect(html).toContain('>Tools &amp; Co</td>');
  });

  it('leaves the email as it is when MAIL_FROM names no one', () => {
    expect(brand('no-reply@example.com').withHeader(MAIL)).toEqual(MAIL);
  });
});
