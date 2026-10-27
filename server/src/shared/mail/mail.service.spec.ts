import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import { type Mail, MailService } from './mail.service';

const { sendMail } = vi.hoisted(() => ({
  sendMail: vi.fn((_mail: object) => Promise.resolve()),
}));
vi.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail, close: () => undefined }),
}));

/** An invitation's reply goes to its inviter, over either transport (ADR-083). */
describe('MailService', () => {
  const MAIL: Mail = {
    to: 'wang.fang@example.com',
    subject: 'Mei Lin invited you to join Northside Naturals',
    text: 'Join Northside Naturals',
    html: '<p>Join Northside Naturals</p>',
    replyTo: 'mei.lin@example.com',
  };

  function service(settings: Partial<Env>): MailService {
    const config = {
      get: (key: keyof Env) =>
        ({ MAIL_FROM: 'Panivo <no-reply@example.com>', ...settings })[key],
    } as unknown as ConfigService<Env, true>;
    return new MailService(config);
  }

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sendMail.mockClear();
  });

  it('gives Resend the address to reply to as reply_to, and none when the email has none', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() => Promise.resolve(new Response('{}')));
    const resend = service({ RESEND_API_KEY: 're_test' });

    await resend.send(MAIL);
    await resend.send({ ...MAIL, replyTo: undefined });

    const [first, second] = fetch.mock.calls.map(
      ([, init]) => JSON.parse(init!.body as string) as Record<string, unknown>,
    );
    expect(first.reply_to).toBe('mei.lin@example.com');
    expect(second).not.toHaveProperty('reply_to');
  });

  it('gives nodemailer the address to reply to as replyTo', async () => {
    await service({ MAIL_HOST: 'localhost', MAIL_PORT: 1025 }).send(MAIL);

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: 'mei.lin@example.com' }),
    );
  });
});
