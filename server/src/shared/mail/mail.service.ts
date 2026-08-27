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
 * Sends mail synchronously (ADR-005). No queue, no retries — a slow SMTP
 * server blocks the request, which is acceptable at V1 volume and is the
 * signal to introduce BullMQ.
 *
 * In development this talks to Mailpit on localhost:1025, which accepts
 * everything and delivers nothing. Messages are readable at localhost:8025,
 * so verification links can be clicked without a provider, an API key, or a
 * domain.
 *
 * No template engine. Two emails do not justify one, and the bodies are built
 * where they are sent so the copy sits next to the flow it belongs to. Add
 * templates when there are enough of them that a non-developer edits the copy.
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get('MAIL_FROM', { infer: true });

    this.transporter = createTransport({
      host: config.get('MAIL_HOST', { infer: true }),
      port: config.get('MAIL_PORT', { infer: true }),
      secure: config.get('MAIL_SECURE', { infer: true }),
      // Mailpit needs no credentials. A real provider does, and adding auth
      // here is two more env vars — deliberately not guessed at now.
    });
  }

  /**
   * Throws on failure rather than swallowing it.
   *
   * The caller decides what that means, and the answers differ: a failed
   * verification email during registration should not roll back the account,
   * whereas a failed password reset must not report success — the user would
   * wait for mail that is never coming.
   */
  async send(mail: Mail): Promise<void> {
    await this.transporter.sendMail({ from: this.from, ...mail });

    // The address, not the body: bodies carry tokens, and ADR-011's redaction
    // exists so credentials stay out of logs.
    this.logger.log(`Sent "${mail.subject}" to ${mail.to}`);
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
