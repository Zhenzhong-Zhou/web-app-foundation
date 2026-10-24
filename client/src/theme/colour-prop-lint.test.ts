// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * The lint rule that keeps a colour path out of a color prop (ADR-055,
 * #196), read through eslint.config.js as npm run lint reads it. A flat
 * config replaces a rule's options rather than merging them, so a later
 * block setting no-restricted-syntax for some files would drop this rule
 * there without a word: hence a component and a spec, both of which it
 * covers.
 */
// client/, from this file's own address, so the config is npm run lint's
// wherever Vitest was started. Without types: the samples are in no
// tsconfig, and the rule reads only the syntax.
const eslint = new ESLint({
  cwd: decodeURIComponent(new URL('../..', import.meta.url).pathname),
  overrideConfig: {
    languageOptions: { parserOptions: { projectService: false } },
  },
});

const sample = (element: string) =>
  `export const Sample = ({ late, tone }: { late: boolean; tone: string }) => (${element});\n`;

async function refusals(element: string, filePath: string) {
  const [result] = await eslint.lintText(sample(element), { filePath });
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-syntax')
    .map((message) => message.message);
}

describe.each(['src/sample.tsx', 'src/sample.test.tsx'])(
  'a colour prop, in %s',
  (filePath) => {
    it.each([
      '<Typography color="text.secondary" />',
      "<Typography color={'text.secondary'} />",
      "<Typography color={late ? 'warning.main' : 'inherit'} />",
      "<Typography color={late && 'warning.main'} />",
      '<Typography color={`text.${tone}`} />',
      '<Box color="text.secondary" />',
    ])('refuses a path: %s', async (element) => {
      expect(await refusals(element, filePath)).toEqual([
        expect.stringMatching(/^A colour path goes in sx/),
      ]);
    });

    it.each([
      '<Typography color="error" />',
      "<Typography color={late ? 'error' : 'inherit'} />",
      "<Typography sx={{ color: 'text.secondary' }} />",
      '<Box color="inherit" sx={{ opacity: late ? 0.5 : 1 }} />',
    ])('takes a name, or a path in sx: %s', async (element) => {
      expect(await refusals(element, filePath)).toEqual([]);
    });
  },
);
