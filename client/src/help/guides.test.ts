import { matchPath } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { SUPPORTED_LOCALES } from '../lib/locales';
import { SIGNED_IN_ROUTES } from '../routes';
import { GUIDE_NAMES, guideFor, GUIDES } from './guides';
import { parseGuide, sectionIds } from './markdown';

/**
 * The check on the guides (ADR-079), run by `npm run verify` and so by CI:
 * every signed-in page has a guide, in every language, written in the
 * subset, its sections the same in each language, and every link and
 * every Learn more leading somewhere that exists.
 *
 * Each test lists everything it finds wrong at once, so one run says all
 * there is to fix.
 */

/**
 * Every guide file, as `loadGuide`'s glob finds them. Vitest keeps this
 * file as it was transformed, the glob's list with it, and notices a file
 * gone but not one added: a guide just added and reported missing here
 * needs `npx vitest --clearCache` once. CI starts with no cache.
 */
const FILES = import.meta.glob<string>('./guides/*/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const pathOf = (locale: string, guide: string) =>
  `./guides/${locale}/${guide}.md`;

const parsed = Object.fromEntries(
  Object.entries(FILES).map(([path, text]) => [path, parseGuide(text)]),
);

describe('the guides', () => {
  it('give every signed-in route exactly one guide, and name only those', () => {
    const wrong = SIGNED_IN_ROUTES.flatMap(({ path }) => {
      const guides = GUIDE_NAMES.filter((name) =>
        (GUIDES[name].routes as readonly string[]).includes(path),
      );
      return guides.length === 1 ? [] : [`${path}: ${guides.length} guides`];
    });

    const routes = SIGNED_IN_ROUTES.map(({ path }) => path);
    const unknown = GUIDE_NAMES.flatMap((name) =>
      GUIDES[name].routes
        .filter((route) => !routes.includes(route))
        .map((route) => `${name} names ${route}, which is no route`),
    );

    expect([...wrong, ...unknown]).toEqual([]);
  });

  it('exist in every language, and nothing else is there', () => {
    const expected = GUIDE_NAMES.flatMap((guide) =>
      SUPPORTED_LOCALES.map((locale) => pathOf(locale, guide)),
    );
    const files = Object.keys(FILES);

    expect({
      missing: expected.filter((path) => !files.includes(path)),
      extra: files.filter((path) => !expected.includes(path)),
    }).toEqual({ missing: [], extra: [] });
  });

  it('use only the subset of Markdown', () => {
    const problems = Object.entries(parsed).flatMap(([path, guide]) => [
      ...(guide.title ? [] : [`${path}: no title`]),
      ...guide.problems.map((problem) => `${path} ${problem}`),
    ]);

    expect(problems).toEqual([]);
  });

  it('have the same sections in every language', () => {
    const differ = GUIDE_NAMES.flatMap((guide) => {
      const english = sectionIds(parsed[pathOf('en', guide)]);
      return SUPPORTED_LOCALES.flatMap((locale) => {
        const theirs = sectionIds(parsed[pathOf(locale, guide)]);
        return theirs.join() === english.join()
          ? []
          : [`${locale}/${guide}: ${theirs.join()} against ${english.join()}`];
      });
    });

    expect(differ).toEqual([]);
  });

  it('link only to pages that exist, and to sections their guides have', () => {
    const broken = Object.entries(parsed).flatMap(([path, guide]) => {
      const locale = path.split('/')[2];
      return guide.blocks
        .flatMap((block) =>
          block.type === 'paragraph' || block.type === 'note'
            ? block.text
            : block.type === 'list'
              ? block.items.flat()
              : [],
        )
        .flatMap((part) => {
          if (part.type !== 'link') return [];
          const page = SIGNED_IN_ROUTES.some((route) =>
            matchPath(route.path, part.path),
          );
          const target = guideFor(part.path);
          if (!page || !target) return [`${path}: ${part.path} is no page`];
          if (
            part.section &&
            !sectionIds(parsed[pathOf(locale, target)]).includes(part.section)
          ) {
            return [`${path}: ${target} has no #${part.section}`];
          }
          return [];
        });
    });

    expect(broken).toEqual([]);
  });

  it('have every section a Learn more opens, in every language', () => {
    // The code can name only these (LearnMoreTarget), so this is every one.
    const missing = GUIDE_NAMES.flatMap((guide) =>
      GUIDES[guide].sections.flatMap((section) =>
        SUPPORTED_LOCALES.filter(
          (locale) =>
            !sectionIds(parsed[pathOf(locale, guide)]).includes(section),
        ).map((locale) => `${locale}/${guide} lacks #${section}`),
      ),
    );

    expect(missing).toEqual([]);
  });
});

describe('guideFor', () => {
  it('finds the guide for an address, a record within it included', () => {
    expect(guideFor('/')).toBe('home');
    expect(guideFor('/orders/new')).toBe('orders');
    expect(guideFor('/orders/0192')).toBe('orders');
    expect(guideFor('/credit-notes/7')).toBe('invoices');
    expect(guideFor('/account/sessions')).toBe('account');
    expect(guideFor('/nowhere')).toBeNull();
  });
});
