import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { escapeHtml } from './escape-html';
import type { Mail } from './mail.service';

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * The name MAIL_FROM gives its address, `Panivo <no-reply@…>`, or null
 * when it gives none: a footer says nothing rather than an address.
 */
export function appNameOf(mailFrom: string): string | null {
  const match = /^\s*"?([^"<]*?)"?\s*<[^>]*>\s*$/.exec(mailFrom);
  const name = match?.[1].trim();
  return name ? name : null;
}

/** Asks whether an address answers with a PNG; never throws. */
export type MarkCheck = (url: string) => Promise<boolean>;

/** The check MailBrand asks, which the e2e suite answers for itself. */
export const MAIL_MARK_CHECK = Symbol('MAIL_MARK_CHECK');

/**
 * Whether the address answers as an image/png. A 200 alone proves
 * nothing: Vite's dev server, the CLIENT_URL on a Mac, answers a missing
 * file with index.html and a 200, as any host with a catch-all rewrite
 * may. Render answers a missing .png with a 404.
 */
export const answersAsPng: MarkCheck = async (url) => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    await response.body?.cancel();
    const type = response.headers.get('content-type')?.split(';')[0];
    return response.ok && type?.trim().toLowerCase() === 'image/png';
  } catch {
    return false;
  }
};

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
 * The mark is shown only once the server has seen it answer as a PNG, so
 * no email carries a broken image: before the static site has it, as in
 * the minutes between the API's deploy and the site's (ADR-081), the
 * header is the name alone. MAIL_FROM with no name gives no header: the
 * mark would stand alone.
 */
@Injectable()
export class MailBrand implements OnApplicationShutdown {
  private readonly logger = new Logger(MailBrand.name);
  private readonly name: string | null;
  private readonly mark: string;
  /** The check's last answer, which the header reads. */
  private markServed = false;
  private timer?: NodeJS.Timeout;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(MAIL_MARK_CHECK) private readonly answers: MarkCheck,
  ) {
    this.name = appNameOf(config.get('MAIL_FROM', { infer: true }));
    this.mark = `${config.get('CLIENT_URL', { infer: true })}/brand/mail-mark.png`;
  }

  /**
   * Checks the mark now and every ten minutes until it answers, in the
   * background: neither start-up nor a send waits for it. Started by
   * main.ts once the server listens, as the timers are (HourlyTimer).
   */
  start(): void {
    this.timer = setInterval(() => void this.check(), TEN_MINUTES);
    this.timer.unref();
    void this.check();
  }

  /** Asks once. Once the mark answers, no more checks follow. */
  async check(): Promise<void> {
    this.markServed = await this.answers(this.mark);
    if (this.markServed) {
      clearInterval(this.timer);
      this.logger.log(`The mail mark answers at ${this.mark}`);
    } else {
      this.logger.warn(
        `The mail mark does not answer as a PNG at ${this.mark}: emails show the name alone, and it is asked again in ten minutes`,
      );
    }
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** The product's email, opening with the header; its text with the name. */
  withHeader(mail: Mail): Mail {
    if (!this.name) return mail;

    const cell =
      'padding:0 0 16px;border-bottom:1px solid #EEF0F4;vertical-align:middle';
    const header = [
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px"><tr>',
      this.markServed &&
        `<td style="${cell};padding-right:10px"><img src="${this.mark}" width="28" height="28" alt="" style="display:block;border:0"></td>`,
      `<td width="100%" style="${cell};font-size:20px;font-weight:700;line-height:28px">${escapeHtml(this.name)}</td>`,
      '</tr></table>',
    ]
      .filter(Boolean)
      .join('');

    return {
      ...mail,
      text: `${this.name}\n\n${mail.text}`,
      html: `${header}\n${mail.html}`,
    };
  }
}
