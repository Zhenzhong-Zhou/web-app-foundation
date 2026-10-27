import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { type Mail, MailService } from './mail.service';
import { type MailBlock, type MailContent, writeMail } from './mail-layout';

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
 * which a dark mail app turns light. The layout's header block draws it
 * (ADR-083): a table, which every mail app lays out alike, where a flex
 * row would not be.
 *
 * The mark is shown only once the server has seen it answer as a PNG, so
 * no email carries a broken image: before the static site has it, as in
 * the minutes between the API's deploy and the site's (ADR-081), the
 * header is the name alone. MAIL_FROM with no name gives no header: the
 * mark would stand alone.
 *
 * The product's services send through it, never through MailService
 * itself, so none can leave out the header, or its subject as its heading;
 * an invitation, the organization's, goes through MailService.
 */
@Injectable()
export class MailBrand implements OnApplicationShutdown {
  private readonly logger = new Logger(MailBrand.name);
  /** MAIL_FROM's name, which signs the product's emails; null with none. */
  readonly name: string | null;
  /** The mark's address on the static site. */
  readonly mark: string;
  /** The check's last answer, which the header reads. */
  private markServed = false;
  /** A miss is a warning once, then a debug line every ten minutes. */
  private missed = false;
  private timer?: NodeJS.Timeout;

  constructor(
    config: ConfigService<Env, true>,
    @Inject(MAIL_MARK_CHECK) private readonly answers: MarkCheck,
    private readonly mail: MailService,
  ) {
    this.name = appNameOf(config.get('MAIL_FROM', { infer: true }));
    this.mark = `${config.get('CLIENT_URL', { infer: true })}/brand/mail-mark.png`;
  }

  /**
   * Checks the mark now and every ten minutes until it answers; a send
   * never waits for it. Resolves with the first answer, within the
   * check's 10 seconds, so main.ts, which starts it once the server
   * listens, starts the hourly timers after it: they run at once, and on
   * a free plan most of their emails go out just after the server wakes.
   */
  start(): Promise<void> {
    this.timer = setInterval(() => void this.check(), TEN_MINUTES);
    this.timer.unref();
    return this.check();
  }

  /** Asks once. Once the mark answers, no more checks follow. */
  async check(): Promise<void> {
    this.markServed = await this.answers(this.mark);
    if (this.markServed) {
      clearInterval(this.timer);
      this.logger.log(`The mail mark answers at ${this.mark}`);
    } else if (!this.missed) {
      this.missed = true;
      this.logger.warn(
        `The mail mark does not answer as a PNG at ${this.mark}: emails show the name alone, and it is asked again every ten minutes`,
      );
    } else {
      this.logger.debug(`The mail mark still does not answer at ${this.mark}`);
    }
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Sends one of the product's emails, opening with the header. */
  send(content: MailContent): Promise<void> {
    return this.mail.send(this.write(content));
  }

  /** The product's email written (ADR-083): its opening, then its own blocks. */
  write(content: MailContent): Mail {
    return writeMail({
      ...content,
      blocks: [...this.opening(content.subject), ...content.blocks],
    });
  }

  /**
   * What every product email opens with: the header, the mark in it once
   * it answers, then the subject as the heading, in the HTML part only, so
   * the text part opens with the name.
   */
  opening(subject: string): MailBlock[] {
    return [
      ...(this.name
        ? [
            {
              kind: 'header' as const,
              name: this.name,
              mark: this.markServed ? this.mark : null,
            },
          ]
        : []),
      { kind: 'heading', text: subject, plain: null },
    ];
  }
}
