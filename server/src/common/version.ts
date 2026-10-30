import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The release, as server/package.json names it (engineering.md, "At each
 * release"). Read from the file, once: npm_package_version exists only
 * when npm starts the process, not under `node dist/main`. Two levels up
 * from src/common and from dist/common alike; a JSON import would fall
 * outside the build's rootDir.
 */
export const VERSION = (
  JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
  ) as { version: string }
).version;
