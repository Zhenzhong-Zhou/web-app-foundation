import { createIntl } from 'react-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Invitation } from '../api/types.gen';
import { setFormatLocale } from '../lib/format';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { roleRef } from '../test/factories';
import en from '../locales/en.json';
import zh from '../locales/zh-Hans.json';
import {
  alreadyInvitedLabel,
  invitedByLabel,
  linkStatusLabel,
} from './invitation-words';

const intlFor = (locale: string, messages: Record<string, string>) =>
  createIntl({ locale, messages, defaultLocale: 'en' });

const invitation = (link: Invitation['link'], invitedAt: string) => ({
  id: 'inv-1',
  email: 'wang.fang@example.com',
  roles: [roleRef('Viewer')],
  invitedBy: { id: 'user-mei', name: 'Mei Lin' },
  invitedAt,
  link,
});

/**
 * Where an invitation stands, in words (ADR-077): its link, who sent it
 * and when, as the organization counts days, and an earlier one never with
 * a last day gone by.
 */
describe('an invitation in words', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10:00 on 19 October in Vancouver.
    vi.setSystemTime(new Date('2026-10-19T17:00:00.000Z'));
    setOrganizationTimeZone('America/Vancouver');
    setFormatLocale('en-GB');
  });
  afterEach(() => {
    vi.useRealTimers();
    setOrganizationTimeZone(null);
    setFormatLocale('en');
  });

  it('says how its link went, until its last day, or that it ended', () => {
    const intl = intlFor('en', en);
    expect(
      linkStatusLabel({ status: 'emailed', lastDay: '2026-10-26' }, intl),
    ).toBe('Emailed · until 26 Oct');
    expect(
      linkStatusLabel({ status: 'copied', lastDay: '2026-10-22' }, intl),
    ).toBe('Link copied · until 22 Oct');
    expect(linkStatusLabel({ status: 'notSent', lastDay: null }, intl)).toBe(
      'Email not sent',
    );
    expect(
      linkStatusLabel({ status: 'ended', lastDay: '2026-10-16' }, intl),
    ).toBe('Ended 16 Oct, not accepted');
  });

  it('names who sent it, "you" to the reader, and today as today', () => {
    const intl = intlFor('en', en);
    // 23:30 on the 18th in Vancouver is already the 19th in UTC.
    const today = invitation(
      { status: 'emailed', lastDay: '2026-10-26' },
      '2026-10-19T08:00:00.000Z',
    );
    const before = invitation(
      { status: 'emailed', lastDay: '2026-10-25' },
      '2026-10-19T06:30:00.000Z',
    );
    expect(invitedByLabel(today, 'user-other', intl)).toBe(
      'Invited by Mei Lin, today',
    );
    expect(invitedByLabel(before, 'user-mei', intl)).toBe(
      'Invited by you, 18 Oct',
    );
  });

  it('says an earlier invitation ended, or its email did not go, never a passed day', () => {
    const intl = intlFor('en', en);
    const at = '2026-10-09T17:00:00.000Z';
    expect(
      alreadyInvitedLabel(
        invitation({ status: 'ended', lastDay: '2026-10-16' }, at),
        'user-other',
        intl,
      ),
    ).toBe('Invited on 9 Oct by Mei Lin. Its link ended on 16 Oct.');
    expect(
      alreadyInvitedLabel(
        invitation({ status: 'notSent', lastDay: null }, at),
        'user-mei',
        intl,
      ),
    ).toBe('Invited on 9 Oct by you. We couldn’t send its email.');
  });

  it('reads in Chinese as the mockups have it', () => {
    setFormatLocale('zh-Hans');
    const intl = intlFor('zh-Hans', zh);
    expect(
      linkStatusLabel({ status: 'emailed', lastDay: '2026-10-26' }, intl),
    ).toBe('已发邮件 · 有效至10月26日');
    expect(
      invitedByLabel(
        invitation(
          { status: 'emailed', lastDay: '2026-10-26' },
          '2026-10-19T08:00:00.000Z',
        ),
        'user-other',
        intl,
      ),
    ).toBe('由 Mei Lin 今天邀请');
  });
});
