import { readFileSync } from 'node:fs';

import { expect, type Page, test } from '@playwright/test';

import { SHOTS, type Width, type Words } from './shots';
import { readTargets } from './targets';

/**
 * The app's language, and the browser's to go with it, so dates and
 * numbers come out as a person in that language would see them.
 */
const LANGUAGES = [
  { app: 'en', browser: 'en-CA' },
  { app: 'fr-CA', browser: 'fr-CA' },
  { app: 'zh-Hans', browser: 'zh-CN' },
];

const MODES = ['light', 'dark'] as const;

const DEFAULT_WIDTHS: Width[] = ['desktop', 'phone'];

function catalogue(language: string): Record<string, string> {
  const file = readFileSync(`src/locales/${language}.json`, 'utf8');
  return JSON.parse(file) as Record<string, string>;
}

/**
 * Labels from the catalogues, as the screen shows them, so a click works
 * in French and Chinese as well as English. English stands in for a
 * message a catalogue lacks, as it does in the app.
 */
function wordsIn(language: string): Words {
  const own = catalogue(language);
  const english = catalogue('en');

  return (id) => {
    const text = own[id] ?? english[id];
    if (text === undefined) throw new Error(`No message ${id} in src/locales`);
    return text;
  };
}

/** Nothing still loading: no request in flight, no placeholder, fonts in. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.MuiSkeleton-root')).toHaveCount(0);
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

for (const language of LANGUAGES) {
  for (const mode of MODES) {
    test.describe(`${language.app} ${mode}`, () => {
      // No colour mode is stored in a fresh browser, so the app follows the
      // system's, which this sets.
      test.use({ locale: language.browser, colorScheme: mode });

      for (const shot of SHOTS) {
        test(shot.name, async ({ page }, info) => {
          const width = info.project.name as Width;

          test.skip(
            !(shot.widths ?? DEFAULT_WIDTHS).includes(width),
            'Not taken at this width',
          );
          test.skip(
            !!shot.languages && !shot.languages.includes(language.app),
            'Not taken in this language',
          );

          const path = shot.path(readTargets());
          test.skip(path === null, 'Not in this demo: seed a fresh one');

          // The language this device chose last, which the app starts from.
          await page.addInitScript((locale: string) => {
            try {
              localStorage.setItem('language', locale);
            } catch {
              // Storage refused: the browser's language, set above, decides.
            }
          }, language.app);

          if (shot.signedOut) await page.context().clearCookies();

          await page.goto(path!);
          await settle(page);

          /**
           * An account with a language of its own overrides this device's
           * choice once signed in (ADR-054), and every picture would come
           * out in that one language. Stopped here rather than saved wrong.
           */
          const shown = (await page.locator('html').getAttribute('lang')) ?? '';
          if (!shown.startsWith(language.app.slice(0, 2))) {
            throw new Error(
              `The page is in ${shown}, not ${language.app}. Set the demo ` +
                "account's language to the browser's on its Account page.",
            );
          }

          if (shot.prepare) {
            await shot.prepare(page, wordsIn(language.app));
            await settle(page);
          }

          if (shot.print) await page.emulateMedia({ media: 'print' });

          await page.screenshot({
            path: `screenshots/out/${shot.name}.${language.app}.${mode}.${width}.png`,
            fullPage: !shot.windowOnly,
            animations: 'disabled',
          });
        });
      }
    });
  }
}
