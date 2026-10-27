import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env';
import type { MailService } from './mail.service';
import {
  answersAsPng,
  appNameOf,
  MailBrand,
  type MarkCheck,
} from './mail-brand';
import { type MailContent, writeMail } from './mail-layout';

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

/**
 * The header the product's emails open with (ADR-082), then each one's
 * subject as its heading (ADR-083).
 */
describe('MailBrand', () => {
  const MARK = 'https://app.example.com/brand/mail-mark.png';
  const MAIL: MailContent = {
    to: 'mei.lin@example.com',
    subject: 'Confirm your email address',
    locale: 'en',
    blocks: [{ kind: 'greeting', name: 'Mei Lin' }],
  };

  const transport = { send: vi.fn(() => Promise.resolve()) };

  function brand(
    mailFrom: string,
    check: MarkCheck = () => Promise.resolve(true),
    clientUrl = 'https://app.example.com',
  ): MailBrand {
    const settings: Partial<Env> = {
      MAIL_FROM: mailFrom,
      CLIENT_URL: clientUrl,
    };
    const config = {
      get: (key: keyof Env) => settings[key],
    } as unknown as ConfigService<Env, true>;
    return new MailBrand(config, check, transport as unknown as MailService);
  }

  afterEach(() => {
    vi.useRealTimers();
  });

  it('opens with the mark from CLIENT_URL and the name beside it, once the mark answers, then the subject', async () => {
    const panivo = brand('Panivo <no-reply@example.com>');
    await panivo.check();
    const mail = panivo.write(MAIL);

    expect(panivo.opening(MAIL.subject)).toEqual([
      { kind: 'header', name: 'Panivo', mark: MARK },
      { kind: 'heading', text: 'Confirm your email address', plain: null },
    ]);
    expect(mail).toEqual(
      writeMail({
        ...MAIL,
        blocks: [...panivo.opening(MAIL.subject), ...MAIL.blocks],
      }),
    );
    expect(mail.text).toBe('Panivo\n\nHi Mei Lin,');
  });

  it('opens with the name alone while the mark does not answer', async () => {
    const check = vi.fn<MarkCheck>(() => Promise.resolve(false));
    const panivo = brand('Panivo <no-reply@example.com>', check);
    await panivo.check();

    expect(check).toHaveBeenCalledWith(MARK);
    expect(panivo.opening(MAIL.subject)[0]).toEqual({
      kind: 'header',
      name: 'Panivo',
      mark: null,
    });
    expect(panivo.write(MAIL).text).toBe('Panivo\n\nHi Mei Lin,');
  });

  it('checks now and every ten minutes until the mark answers, and never waits for it', async () => {
    vi.useFakeTimers();
    let answer: (value: boolean) => void = () => undefined;
    const check = vi.fn<MarkCheck>(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const panivo = brand('Panivo <no-reply@example.com>', check);

    // The first answer still out: the header does not wait for it, and
    // start() resolves only with it, so main.ts starts the timers after.
    let started = false;
    void panivo.start().then(() => {
      started = true;
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(panivo.opening(MAIL.subject)[0]).toMatchObject({ mark: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(false);
    answer(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toBe(true);

    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(check).toHaveBeenCalledTimes(2);
    answer(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(panivo.opening(MAIL.subject)[0]).toMatchObject({ mark: MARK });

    // Answered: no more checks.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(check).toHaveBeenCalledTimes(2);
    panivo.onApplicationShutdown();
  });

  it('warns of a missing mark once, then says so at debug level', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const debug = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const panivo = brand('Panivo <no-reply@example.com>', () =>
      Promise.resolve(false),
    );

    await panivo.check();
    await panivo.check();
    await panivo.check();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });

  it('sends the email it is given with its header', async () => {
    const panivo = brand('Panivo <no-reply@example.com>');
    await panivo.check();

    await panivo.send(MAIL);

    expect(transport.send).toHaveBeenCalledWith(panivo.write(MAIL));
  });

  it('gives the name and the mark’s address as deployed, which the layout escapes', async () => {
    const panivo = brand(
      'Tools & Co <no-reply@example.com>',
      () => Promise.resolve(true),
      'https://app.example.com/?a="1"&b=2',
    );
    await panivo.check();

    expect(panivo.opening(MAIL.subject)[0]).toEqual({
      kind: 'header',
      name: 'Tools & Co',
      mark: 'https://app.example.com/?a="1"&b=2/brand/mail-mark.png',
    });
  });

  it('opens with the subject when MAIL_FROM names no one', () => {
    const panivo = brand('no-reply@example.com');

    expect(panivo.opening(MAIL.subject)).toEqual([
      { kind: 'heading', text: 'Confirm your email address', plain: null },
    ]);
    expect(panivo.write(MAIL).text).toBe('Hi Mei Lin,');
  });
});

/** The mark answers only as a PNG: a dev server answers a missing file with index.html. */
describe('answersAsPng', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function answering(response: Response | Error): void {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      response instanceof Error
        ? Promise.reject(response)
        : Promise.resolve(response),
    );
  }

  it('is true for an image/png', async () => {
    answering(
      new Response('png', { headers: { 'Content-Type': 'image/png' } }),
    );
    expect(await answersAsPng('https://app.example.com/m.png')).toBe(true);
  });

  it('is false for index.html with a 200, a 404 or no answer', async () => {
    answering(
      new Response('<!doctype html>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      }),
    );
    expect(await answersAsPng('https://app.example.com/m.png')).toBe(false);

    answering(
      new Response('png', {
        status: 404,
        headers: { 'Content-Type': 'image/png' },
      }),
    );
    expect(await answersAsPng('https://app.example.com/m.png')).toBe(false);

    answering(new Error('connect ECONNREFUSED'));
    expect(await answersAsPng('https://app.example.com/m.png')).toBe(false);
  });
});
