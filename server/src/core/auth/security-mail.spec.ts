import { buildSecurityMail } from './security-mail';

const CONTEXT = {
  to: 'someone@example.com',
  name: 'Bob',
  ip: '203.0.113.7',
  userAgent: undefined,
  at: new Date('2026-10-06T12:00:00Z'),
  clientUrl: 'https://app.example.com',
};

/**
 * Security emails in the recipient's language (ADR-054), with the English
 * as it always read: the subject, the date line and the links.
 */
describe('buildSecurityMail', () => {
  it('writes the English as before', () => {
    const mail = buildSecurityMail('account.password_changed', {
      ...CONTEXT,
      locale: 'en',
    })!;

    expect(mail.subject).toBe('Your password was changed');
    expect(mail.text).toContain('Hi Bob,');
    expect(mail.text).toContain(`When: ${CONTEXT.at.toUTCString()}`);
    expect(mail.text).toContain(
      'If it was not, reset your password now — that signs out every device: https://app.example.com/forgot-password',
    );
    expect(mail.html).toContain(
      '<a href="https://app.example.com/forgot-password">reset your password</a>',
    );
  });

  it('writes the same mail in the recipient’s language, links intact', () => {
    const mail = buildSecurityMail('account.password_changed', {
      ...CONTEXT,
      locale: 'fr-CA',
    })!;

    expect(mail.subject).toBe('Votre mot de passe a été changé');
    expect(mail.text).toContain('Bonjour Bob,');
    expect(mail.html).toContain(
      '<a href="https://app.example.com/forgot-password">réinitialisez votre mot de passe</a>',
    );
    expect(mail.text).not.toContain('If this was you');
  });
});
