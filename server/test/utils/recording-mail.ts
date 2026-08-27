import type { Mail, MailService } from '../../src/shared/mail/mail.service';

/**
 * A MailService that records instead of sending.
 *
 * Injected by every suite that registers a user, because registration now
 * sends a verification email — without this each test opens an SMTP
 * connection, which pollutes the dev inbox locally and fails outright in CI
 * where no Mailpit is running.
 *
 * Records rather than discards: the verification flow is only testable end to
 * end if the token can be read back out of the message that carried it. A stub
 * that swallows mail can prove an email was attempted and nothing more.
 */
export class RecordingMailService implements Pick<MailService, 'send'> {
  readonly sent: Mail[] = [];

  send(mail: Mail): Promise<void> {
    this.sent.push(mail);
    return Promise.resolve();
  }

  /** The most recent message to an address, which is what a test just caused. */
  lastTo(email: string): Mail | undefined {
    return [...this.sent].reverse().find((mail) => mail.to === email);
  }

  reset(): void {
    this.sent.length = 0;
  }
}
