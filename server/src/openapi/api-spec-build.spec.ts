import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import * as ts from 'typescript';

const SERVER = resolve(__dirname, '..', '..');

/** A tsconfig's options as the compiler resolves them, paths absolute. */
function optionsOf(file: string): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(SERVER, file),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        );
      },
    },
  );
  if (!parsed) throw new Error(`${file} could not be read`);
  return parsed.options;
}

const inside = (child: string, parent: string) =>
  !relative(parent, child).startsWith('..');

/**
 * `npm run api:spec` builds the document's script apart from the app
 * (#194). Sharing dist/ with `npm run start:dev`, each build's clean
 * deleted what the other had just written: the dev server could not find
 * its modules, or the script its own file.
 */
describe("npm run api:spec's build (#194)", () => {
  const app = optionsOf('tsconfig.build.json');
  const spec = optionsOf('tsconfig.openapi.json');

  it('writes to a directory of its own, never into the app’s dist/', () => {
    expect(spec.outDir).toBeDefined();
    expect(app.outDir).toBeDefined();
    expect(inside(spec.outDir!, app.outDir!)).toBe(false);
    expect(inside(app.outDir!, spec.outDir!)).toBe(false);
  });

  it('beside dist/, so paths read from __dirname land where they do in the app', () => {
    // write-openapi.ts writes ../../openapi.json; HealthController reads
    // package.json and the documents their fonts, the same way.
    expect(dirname(spec.outDir!)).toBe(dirname(app.outDir!));
  });

  it('keeps its incremental state inside that directory, so its clean starts afresh', () => {
    expect(spec.incremental).toBe(true);
    expect(inside(spec.tsBuildInfoFile!, spec.outDir!)).toBe(true);
  });

  it('emits no declarations, which `npm run typecheck` would read as sources', () => {
    expect(spec.declaration).toBe(false);
  });

  it('is the build the script runs, and the output it runs', () => {
    const { scripts } = JSON.parse(
      readFileSync(join(SERVER, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    const outDir = relative(SERVER, spec.outDir!);

    expect(scripts['api:spec']).toBe(
      `nest build -p tsconfig.openapi.json && node ${outDir}/openapi/write-openapi.js`,
    );
  });
});
