// @vitest-environment node
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * src/loading.js runs before the app, as a classic script, so it is held to
 * the browser floor as the app's code is (ADR-082), though the TypeScript
 * blocks of eslint.config.js do not reach a .js file. Read through the
 * config as npm run lint reads it, from client/, wherever Vitest started.
 */
const eslint = new ESLint({
  cwd: decodeURIComponent(new URL('..', import.meta.url).pathname),
});

async function rules(code: string): Promise<(string | null)[]> {
  const [result] = await eslint.lintText(code, { filePath: 'src/loading.js' });
  return result.messages.map((message) => message.ruleId);
}

describe('src/loading.js', () => {
  it('is held to the browser floor', async () => {
    // Firefox has toSorted only from 115.
    expect(await rules('[].toSorted();\n')).toEqual(['compat/compat']);
  });

  it('is read as a classic script in the browser', async () => {
    expect(
      await rules('addEventListener("error", () => location.reload());\n'),
    ).toEqual([]);
    expect(await rules('notDefined();\n')).toEqual(['no-undef']);
  });
});
