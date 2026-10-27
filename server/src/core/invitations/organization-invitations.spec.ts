import { writeMail } from '../../shared/mail/mail-layout';
import { organizationStartedMail } from './operator-mail';
import {
  organizationInvitationLink,
  organizationInvitationMessage,
  organizationLinkEnd,
  organizationLinkLastDay,
} from './organization-invitations';

/** ADR-078: an organization invitation's link, message and the operator's email. */
describe('organizationLinkEnd', () => {
  it('ends seven days on, when that day has ended everywhere: noon UTC the day after', () => {
    const end = organizationLinkEnd(new Date('2026-10-20T23:30:00Z'));
    expect(end.lastDay).toBe('2026-10-27');
    expect(end.expiresAt.toISOString()).toBe('2026-10-28T12:00:00.000Z');
  });

  it('counts from the UTC day, whatever the hour', () => {
    expect(organizationLinkEnd(new Date('2026-10-20T00:00:00Z')).lastDay).toBe(
      '2026-10-27',
    );
  });

  it('reads the last day back from the end', () => {
    expect(organizationLinkLastDay(new Date('2026-10-28T12:00:00.000Z'))).toBe(
      '2026-10-27',
    );
  });
});

describe('organizationInvitationLink', () => {
  it('opens the invitation page, whatever slash the address ends with', () => {
    expect(organizationInvitationLink('https://app.example.com/', 'abc')).toBe(
      'https://app.example.com/invitation?token=abc',
    );
  });
});

describe('organizationInvitationMessage', () => {
  it('names the organization and the last day, in the invitation’s language', () => {
    const chinese = organizationInvitationMessage(
      'zh-Hans',
      '青禾贸易',
      '2026-10-27',
    );
    expect(chinese).toContain('「青禾贸易」');
    expect(chinese).toContain('2026年10月27日');

    const english = organizationInvitationMessage(
      'en',
      'Harbour Herbs',
      '2026-10-27',
    );
    expect(english).toContain('set up Harbour Herbs');
    expect(english).toContain('October 27, 2026');
  });
});

describe('organizationStartedMail', () => {
  it('tells the operator which organization, by whom and when, escaping names', () => {
    const mail = writeMail(
      organizationStartedMail({
        to: 'ops@example.com',
        organizationName: 'Harbour <Herbs>',
        name: 'Chen Jie',
        email: 'chen.jie@harbourherbs.example',
        at: new Date('2026-10-21T10:42:00Z'),
        verified: false,
      }),
    );
    expect(mail.subject).toBe('Harbour <Herbs> was set up');
    expect(mail.text).toContain(
      'Chen Jie (chen.jie@harbourherbs.example) accepted the invitation and set up Harbour <Herbs> on 21 October 2026 at 10:42 UTC.',
    );
    expect(mail.text).toContain('isn’t confirmed yet');
    expect(mail.html).toContain('Harbour &lt;Herbs&gt;');
    expect(mail.html).not.toContain('<Herbs>');
  });
});
