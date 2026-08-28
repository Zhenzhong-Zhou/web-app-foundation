import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type { Env } from '../../config/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends mail synchronously (ADR-005), over one of two transports.
 *
 * **HTTP when RESEND_API_KEY is set.** Most managed hosts block outbound port
 * 587 to prevent spam — Render's free tier does — so SMTP from a container
 * fails with a connection timeout that looks like a credentials problem and is
 * not. Outbound HTTPS is never blocked, and every provider offers an HTTP API
 * for exactly this reason.
 *
 * **SMTP otherwise.** Mailpit accepts anything on localhost:1025 and needs no
 * account, so development stays zero-config (ADR-005).
 *
 * The transport is chosen by which credentials exist rather than by NODE_ENV:
 * a developer pointing at a real provider should get the working one without
 * pretending to be production.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;
  private readonly apiKey?: string;
  private readonly transporter?: Transporter;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });
    this.apiKey = config.get('RESEND_API_KEY', { infer: true });

    if (this.apiKey) return;

    this.transporter = createTransport({
      host: config.get('MAIL_HOST', { infer: true }),
      port: config.get('MAIL_PORT', { infer: true }),
      secure: config.get('MAIL_SECURE', { infer: true }),
      // Fail in seconds rather than hanging: a blocked port otherwise ties up
      // the request thread until the OS gives up, which is what the fifteen
      // second aborts on Render looked like.
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
    });
  }

  /**
   * Throws on failure rather than swallowing it. Callers differ: a failed
   * verification email must not roll back a registration, while a failed reset
   * must not report success (ADR-017).
   */
  async send(mail: Mail): Promise<void> {
    if (this.apiKey) {
      await this.sendOverHttp(mail);
    } else {
      await this.transporter!.sendMail({ from: this.from, ...mail });
    }

    // The address, not the body: bodies carry tokens, and ADR-011's redaction
    // exists so credentials stay out of logs.
    this.logger.log(`Sent "${mail.subject}" to ${mail.to}`);
  }

  private async sendOverHttp(mail: Mail): Promise<void> {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      // The body carries the provider's reason — an unverified sender domain,
      // a bad key — and without it every failure reads the same.
      throw new Error(
        `Resend refused the message (${response.status}): ${await response.text()}`,
      );
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
  }
}
