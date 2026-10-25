import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { escapeHtml } from './escape-html';
import type { Mail } from './mail.service';

/**
 * The name MAIL_FROM gives its address, `Panivo <no-reply@…>`, or null
 * when it gives none: a footer says nothing rather than an address.
 */
export function appNameOf(mailFrom: string): string | null {
  const match = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(mailFrom);
  const name = match?.[1].trim();
  return name ? name : null;
}

/**
 * The header every email the product sends opens with (ADR-082): its mark
 * on the navy plate, and its name in text beside it, MAIL_FROM's, which
 * already signs them. Never an invitation's, which is the organization's
 * (ADR-077).
 *
 * The mark is a PNG the static site serves, at twice the 28 px it is
 * drawn: Gmail drops an image carried as a `data:` URL. Its `alt` is
 * empty, since the name beside it says the same, so a mail app that blocks
 * images loses nothing. The name takes the mail app's own text colour,
 * which a dark mail app turns light. A table, which every mail app lays
 * out alike, where a flex row would not be.
 *
 * MAIL_FROM with no name gives no header: the mark would stand alone.
 */
@Injectable()
export class MailBrand {
  private readonly name: string | null;
  private readonly mark: string;

  constructor(config: ConfigService<Env, true>) {
    this.name = appNameOf(config.get('MAIL_FROM', { infer: true }));
    this.mark = `${config.get('CLIENT_URL', { infer: true })}/brand/mail-mark.png`;
  }

  /** The product's email, opening with the header; its text with the name. */
  withHeader(mail: Mail): Mail {
    if (!this.name) return mail;

    const cell =
      'padding:0 0 16px;border-bottom:1px solid #EEF0F4;vertical-align:middle';
    const header = [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px"><tr>',
      `<td style="${cell};padding-right:10px"><img src="${this.mark}" width="28" height="28" alt="" style="display:block;border:0"></td>`,
      `<td width="100%" style="${cell};font-size:20px;font-weight:700;line-height:28px">${escapeHtml(this.name)}</td>`,
      '</tr></table>',
    ].join('');

    return {
      ...mail,
      text: `${this.name}\n\n${mail.text}`,
      html: `${header}\n${mail.html}`,
    };
  }
}
