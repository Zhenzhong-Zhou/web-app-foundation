import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { mailSamples } from './mail-samples';

const TEXT = join(__dirname, '__text__');

/** What a difference says: whose bug it is, or how to rewrite on purpose. */
const ON_PURPOSE =
  'This email’s text part changed. A change of layout or code must leave it as it is: fix the change, not the file. ' +
  'Only words changed on purpose (#255, a translation corrected) rewrite it: npm run mail:text -- --update in server/, ' +
  'with the words, in a commit that changes nothing else and names them';

/**
 * ADR-083's proof: every email's text part stays as it is, character for
 * character, in every email and language, the product's header included.
 * Each file under __text__/ was written from the emails as they were before
 * the layout. A change of layout or code never rewrites one, ADR-083's
 * layout included: a difference is a bug in the change. A branch that
 * changes an email's words on purpose, as #255 or a translation corrected,
 * rewrites them with `npm run mail:text -- --update` in server/, committed
 * with the words, in a commit that changes nothing else and names them
 * (conventions.md, "Tests"). CI never writes one.
 */
describe('every email’s text part', async () => {
  const samples = await mailSamples();

  it.each(samples.map((sample) => [`${sample.name}.${sample.locale}`, sample]))(
    '%s stays as it is',
    async (file, { mail }) => {
      await expect(mail.text, ON_PURPOSE).toMatchFileSnapshot(
        join(TEXT, `${file}.txt`),
      );
    },
  );

  // A sample dropped would leave its file proving nothing.
  it('has a file for every sample, and no other', () => {
    expect(readdirSync(TEXT).sort()).toEqual(
      samples.map(({ name, locale }) => `${name}.${locale}.txt`).sort(),
    );
  });
});
