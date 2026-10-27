import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { type MailSample, mailSamples } from './mail-samples';

const TEXT = join(__dirname, '__text__');
/** Half the 102 KB at which Gmail cuts a message off (ADR-083). */
const LIMIT = 50 * 1024;

/** What a difference says: whose bug it is, or how to rewrite on purpose. */
const ON_PURPOSE =
  'This email’s text part changed. A change of layout or code must leave it as it is: fix the change, not the file. ' +
  'Only words changed on purpose (#255, a translation corrected) rewrite it: npm run mail:text -- --update in server/, ' +
  'with the words, in a commit that changes nothing else and names them';

/** Every email the app sends, in each language it is sent in, built once. */
describe('every email', async () => {
  const samples = await mailSamples();
  const named = samples.map((sample): [string, MailSample] => [
    `${sample.name}.${sample.locale}`,
    sample,
  ]);

  /**
   * ADR-083's proof: every email's text part stays as it is, character for
   * character, in every email and language, the product's header included.
   * Each file under __text__/ was written from the emails as they were
   * before the layout. A change of layout or code never rewrites one,
   * ADR-083's layout included: a difference is a bug in the change. A
   * branch that changes an email's words on purpose, as #255 or a
   * translation corrected, rewrites them with
   * `npm run mail:text -- --update` in server/, committed with the words,
   * in a commit that changes nothing else and names them (conventions.md,
   * "Tests"). CI never writes one.
   */
  describe('its text part', () => {
    it.each(named)('%s stays as it is', async (file, { mail }) => {
      await expect(mail.text, ON_PURPOSE).toMatchFileSnapshot(
        join(TEXT, `${file}.txt`),
      );
    });

    // A sample dropped would leave its file proving nothing.
    it('has a file for every sample, and no other', () => {
      expect(readdirSync(TEXT).sort()).toEqual(
        samples.map(({ name, locale }) => `${name}.${locale}.txt`).sort(),
      );
    });
  });

  /** ADR-083's two tests that hold every email the app sends. */
  it.each(named)(
    '%s stays under 50 KB and loads nothing but the mark',
    (_, { mail }) => {
      expect(Buffer.byteLength(mail.html)).toBeLessThan(LIMIT);

      const images = mail.html.match(/<img\b[^>]*>/g) ?? [];
      expect(images.length).toBeLessThanOrEqual(1);
      for (const image of images) {
        expect(image).toMatch(
          / src="http:\/\/localhost:5173\/brand\/mail-mark\.png"/,
        );
      }
      expect(mail.html.match(/\bsrc=/g) ?? []).toHaveLength(images.length);
      expect(mail.html).not.toContain('url(');
      expect(mail.html).not.toMatch(/<link\b/);
    },
  );

  /** Buttons only where the action already has words (ADR-083). */
  it('has buttons to confirm an address, reset a password and accept an invitation, one to an email, in every language', () => {
    const buttoned = samples.filter(({ mail }) =>
      mail.html.includes('class="button"'),
    );

    expect(buttoned.map(({ name, locale }) => `${name}.${locale}`)).toEqual([
      'confirm-email.en',
      'confirm-email.fr-CA',
      'confirm-email.zh-Hans',
      'reset-password.en',
      'reset-password.fr-CA',
      'reset-password.zh-Hans',
      'invitation.en',
      'invitation.fr-CA',
      'invitation.zh-Hans',
    ]);
    for (const { mail } of buttoned) {
      expect(mail.html.match(/class="button"/g)).toHaveLength(1);
    }
  });
});
