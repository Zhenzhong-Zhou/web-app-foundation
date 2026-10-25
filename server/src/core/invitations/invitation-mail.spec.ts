import { invitationMail } from './invitation-mail';

describe('invitationMail', () => {
  const context = {
    locale: 'en' as const,
    to: 'wang.fang@example.com',
    inviter: { name: 'Mei Lin', email: 'mei.lin@example.com' },
    organizationName: 'Northside Naturals',
    roles: [{ name: 'Admin', description: 'Day-to-day work.' }],
    system: 'Admin' as const,
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

  // ADR-080: a made role, or several, take no article, and several read
  // as a list, each line beside its role's name.
  it('names a made role bare, and several as a list in each language', () => {
    const warehouse = {
      name: 'Warehouse lead',
      description: 'Receives and ships.',
    };
    const sales = { name: 'Sales', description: null };
    const made = { ...context, system: 'other' as const };

    expect(
      invitationMail({ ...made, roles: [warehouse], appName: null }).text,
    ).toContain(
      'invited you to join as Warehouse lead.\n\nReceives and ships.',
    );

    const both = { ...made, roles: [warehouse, sales], appName: null };
    const { text } = invitationMail(both);
    expect(text).toContain('invited you to join as Warehouse lead and Sales.');
    expect(text).toContain('Warehouse lead: Receives and ships.');
    expect(invitationMail({ ...both, locale: 'fr-CA' }).text).toContain(
      'Warehouse lead et Sales',
    );
    expect(invitationMail({ ...both, locale: 'zh-Hans' }).text).toContain(
      'Warehouse lead和Sales',
    );
  });

  it('puts the link under its action, with no colon to write in each language', () => {
    expect(
      invitationMail({ ...context, locale: 'zh-Hans', appName: null }).text,
    ).toContain('接受邀请\nhttps://app.example.com/invitation?token=abc');
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
