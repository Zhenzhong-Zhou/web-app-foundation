import { appNameOf, invitationMail } from './invitation-mail';

/** The footer names who sends it, and never shows an address (ADR-077). */
describe('appNameOf', () => {
  it('reads the display name MAIL_FROM gives its address', () => {
    expect(appNameOf('Foundation <no-reply@example.com>')).toBe('Foundation');
    expect(appNameOf('"Northside Tools" <no-reply@example.com>')).toBe(
      'Northside Tools',
    );
  });

  it('is null for an address with no name', () => {
    expect(appNameOf('no-reply@example.com')).toBeNull();
    expect(appNameOf('<no-reply@example.com>')).toBeNull();
  });
});

describe('invitationMail', () => {
  const context = {
    locale: 'en' as const,
    to: 'wang.fang@example.com',
    inviter: { name: 'Mei Lin', email: 'mei.lin@example.com' },
    organizationName: 'Northside Naturals',
    role: { name: 'Admin', description: 'Day-to-day work.' },
    note: null,
    timeZone: 'America/Vancouver',
    lastDay: '2026-10-26',
    link: 'https://app.example.com/invitation?token=abc',
  };

  it('signs for the organization by the app’s name, or by none', () => {
    expect(
      invitationMail({ ...context, appName: 'Foundation' }).text,
    ).toContain('Sent for Northside Naturals by Foundation.');
    expect(invitationMail({ ...context, appName: null }).text).toContain(
      'Sent for Northside Naturals.',
    );
  });

  it('gives the role its article, and the last day to its end in the zone', () => {
    const { text } = invitationMail({ ...context, appName: null });
    expect(text).toContain(
      'Mei Lin (mei.lin@example.com) invited you to join as an Admin.',
    );
    expect(text).toContain(
      'until the end of October 26, 2026, Pacific Time (Vancouver).',
    );
  });

  it('names only the organization once the inviter has gone (ADR-077)', () => {
    const mail = invitationMail({
      ...context,
      inviter: null,
      note: 'Deliveries at the North site',
      appName: null,
    });
    expect(mail.subject).toBe('An invitation to join Northside Naturals');
    expect(mail.text).toContain(
      'Northside Naturals invited you to join as an Admin.',
    );
    expect(mail.text).toContain(
      'From Northside Naturals\nDeliveries at the North site',
    );
    expect(mail.text + mail.html).not.toContain('Mei Lin');
    expect(mail.text + mail.html).not.toContain('mei.lin@example.com');
  });
});
