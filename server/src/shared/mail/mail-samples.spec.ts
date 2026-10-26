import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { mailSamples } from './mail-samples';

const TEXT = join(__dirname, '__text__');

/**
 * ADR-083's proof: every email's text part stays as it is, character for
 * character, in every email and language, the product's header included.
 * Each file under __text__/ was written from the emails as they were before
 * the layout. A difference is a bug in the change, never a file to write
 * again; only a change of words, in a commit of its own, rewrites one
 * (`npx vitest run -u` here). CI never writes one.
 */
describe('every email’s text part', async () => {
  const samples = await mailSamples();

  it.each(samples.map((sample) => [`${sample.name}.${sample.locale}`, sample]))(
    '%s stays as it is',
    async (file, { mail }) => {
      await expect(mail.text).toMatchFileSnapshot(join(TEXT, `${file}.txt`));
    },
  );

  // A sample dropped would leave its file proving nothing.
  it('has a file for every sample, and no other', () => {
    expect(readdirSync(TEXT).sort()).toEqual(
      samples.map(({ name, locale }) => `${name}.${locale}.txt`).sort(),
    );
  });
});
