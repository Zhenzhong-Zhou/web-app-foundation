/**
 * The emails of one `npm run mail:preview` as pictures (ADR-083), for
 * `npm run screenshots:compare` to set beside another preview's:
 *
 *     npm run screenshots:mail -- [<preview folder>]
 *
 * The folder is tmp/mail-preview/, where the preview writes, unless another
 * is named, such as a copy kept from before a change. Each email in it,
 * `<email>.<language>.html`, is opened at 375 px and at 600 px, the column's
 * full width, in light and dark, and pictured whole into the same folder as
 * `<email>.<language>.<mode>.<width>.png`, the names compare.mjs reads: 375
 * px is its phone, at twice the pixels as capture.spec.ts's phone, and 600
 * px its desktop, the width a mail app on a computer gives the column. The
 * preview empties its folder before writing, so its pictures go with it.
 *
 * The mark is answered from public/, as the dev client serves it, so no
 * server has to run; nothing else an email asks for is answered.
 *
 * Playwright's own Chromium, which the e2e suite installs; no other
 * dependency.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from '@playwright/test';

const WIDTHS = [
  { name: 'phone', viewport: { width: 375, height: 667 }, scale: 2 },
  { name: 'desktop', viewport: { width: 600, height: 800 }, scale: 1 },
];
const MODES = ['light', 'dark'];

const USAGE = 'Usage: npm run screenshots:mail -- [<preview folder>]';

let options;
try {
  options = parseArgs({ allowPositionals: true });
} catch (error) {
  console.error(`${error.message}\n${USAGE}`);
  process.exit(2);
}
if (options.positionals.length > 1) {
  console.error(USAGE);
  process.exit(2);
}

// npm runs the script in client/; the folder is read from where it was
// typed.
const typedIn = process.env.INIT_CWD ?? process.cwd();
const [named] = options.positionals;
const folder = named
  ? path.resolve(typedIn, named)
  : fileURLToPath(new URL('../../tmp/mail-preview', import.meta.url));
const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

let emails;
try {
  emails = readdirSync(folder)
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .sort();
} catch {
  console.error(`No folder ${folder}. Run npm run mail:preview in server/.`);
  process.exit(1);
}
if (emails.length === 0) {
  console.error(`No emails in ${folder}. Run npm run mail:preview in server/.`);
  process.exit(1);
}

const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: width.viewport,
      deviceScaleFactor: width.scale,
    });
    await context.route(
      (url) => url.protocol === 'http:' || url.protocol === 'https:',
      (route) => {
        const { pathname } = new URL(route.request().url());
        const file = path.join(PUBLIC, decodeURIComponent(pathname));
        return existsSync(file) ? route.fulfill({ path: file }) : route.abort();
      },
    );
    const page = await context.newPage();

    for (const mode of MODES) {
      await page.emulateMedia({ colorScheme: mode });
      for (const email of emails) {
        await page.goto(pathToFileURL(path.join(folder, email)).href);
        const name = email.slice(0, -'.html'.length);
        await page.screenshot({
          path: path.join(folder, `${name}.${mode}.${width.name}.png`),
          fullPage: true,
          animations: 'disabled',
        });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(
  `Wrote ${emails.length * WIDTHS.length * MODES.length} pictures of ${emails.length} emails to ${folder}.`,
);
