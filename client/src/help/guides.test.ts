import {
  isLiteralElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  type MessageFormatElement,
  parse,
} from '@formatjs/icu-messageformat-parser';
import { matchPath } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { type Locale, SUPPORTED_LOCALES } from '../lib/locales';
import en from '../locales/en.json';
import fr from '../locales/fr-CA.json';
import zh from '../locales/zh-Hans.json';
import { SIGNED_IN_ROUTES } from '../routes';
import { GUIDE_NAMES, guideFor, GUIDES } from './guides';
import {
  type Inline,
  type ParsedGuide,
  parseGuide,
  sectionIds,
} from './markdown';

/**
 * The check on the guides (ADR-079), run by `npm run verify` and so by CI:
 * every signed-in page has a guide, in every language, written in the
 * subset, its sections the same in each language, every link and every
 * Learn more leading somewhere that exists, and every word in bold one a
 * screen shows.
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

/** A guide's words, links and bold, wherever its blocks hold them. */
const inlinesOf = (guide: ParsedGuide): Inline[] =>
  guide.blocks.flatMap((block) =>
    block.type === 'paragraph' || block.type === 'note'
      ? block.text
      : block.type === 'list'
        ? block.items.flat()
        : [],
  );

/**
 * A value in a message: a number, a name, a date. A screen fills it in,
 * so a guide may write anything there.
 */
const VALUE = null;
type Spelling = (string | typeof VALUE)[];

/** Each way a message can read, its selects and plurals spelled out. */
function spellings(elements: MessageFormatElement[]): Spelling[] {
  return elements.reduce<Spelling[]>(
    (sofar, element) => {
      const ways: Spelling[] = isLiteralElement(element)
        ? [[element.value]]
        : isTagElement(element)
          ? spellings(element.children)
          : isSelectElement(element) || isPluralElement(element)
            ? Object.values(element.options).flatMap((option) =>
                spellings(option.value),
              )
            : [[VALUE]];
      return sofar.flatMap((spelling) =>
        ways.map((way) => [...spelling, ...way]),
      );
    },
    [[]],
  );
}

/** Any space as one plain space: a no-break space reads the same. */
const spaced = (text: string) => text.replace(/\s+/g, ' ').trim();

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether bold words in a guide are a screen's words in that language: the
 * text of one of its messages, read so that a guide can quote a label in
 * its sentence:
 *
 * - any space is a space, and a message's closing full stop may be left
 *   off: **Nothing is late today**;
 * - a value is a number, another message's text, or "…": **2 late**,
 *   **Orders · Draft** ({page} · {name}), **自…起生效**;
 * - a value, select or plural at either end may be left out, naming a
 *   label by the words that do not change: **Credit on**, from Credit on
 *   {number}.
 */
function screenWords(catalogue: Record<string, string>) {
  const plain = new Set<string>();
  const patterns: RegExp[] = [];

  for (const message of Object.values(catalogue)) {
    const elements = parse(message);
    const ends = (at: number) =>
      elements[at] !== undefined &&
      !isLiteralElement(elements[at]) &&
      !isTagElement(elements[at]);
    const first = ends(0) ? 1 : 0;
    const last = ends(elements.length - 1)
      ? elements.length - 1
      : elements.length;
    const shortened = [
      elements,
      elements.slice(first),
      elements.slice(0, last),
      elements.slice(first, last),
    ];

    for (const spelling of shortened.flatMap(spellings)) {
      const words = spelling.filter((part) => part !== VALUE).join('');
      if (!/\S/.test(words)) continue;

      if (!spelling.includes(VALUE)) {
        const text = spaced(words);
        plain.add(text);
        plain.add(text.replace(/[.。]$/, ''));
        continue;
      }

      // Its words between its values, a value's spaces kept with it: one
      // written "…" may sit against its words, as Chinese writes it.
      const pieces = spelling.reduce<Spelling>((all, part) => {
        const last = all.at(-1);
        if (part !== VALUE && typeof last === 'string') {
          all[all.length - 1] = last + part;
        } else {
          all.push(part);
        }
        return all;
      }, []);
      const spaceAt = (at: number, side: RegExp) =>
        side.test(pieces[at] ?? '') ? ' ' : '';
      const source = pieces
        .map((piece, i) => {
          if (piece === VALUE) {
            const before = spaceAt(i - 1, /\s$/);
            const after = spaceAt(i + 1, /^\s/);
            return `(?:${before}(.+?)${after}| ?… ?)`;
          }
          let words = piece.replace(/\s+/g, ' ');
          if (i === 0 || pieces[i - 1] === VALUE) words = words.trimStart();
          if (i === pieces.length - 1) {
            words = words.trimEnd().replace(/[.。]$/, '');
          } else if (pieces[i + 1] === VALUE) {
            words = words.trimEnd();
          }
          return escaped(words);
        })
        .join('');
      patterns.push(new RegExp(`^${source}[.。]?$`, 'u'));
    }
  }

  const value = (text: string | undefined) =>
    text === undefined || /^\d[\d., ]*$/.test(text) || plain.has(text);

  return (bold: string) => {
    const text = spaced(bold);
    return (
      plain.has(text) ||
      patterns.some((pattern) => pattern.exec(text)?.slice(1).every(value))
    );
  };
}

const SHOWN: Record<Locale, (bold: string) => boolean> = {
  en: screenWords(en),
  'fr-CA': screenWords(fr),
  'zh-Hans': screenWords(zh),
};

/**
 * Bold words that are no client message's text, each kept on purpose: the
 * bold-phrase check below passes them, and fails while one is in no guide.
 */
const NOT_MESSAGES: { words: Record<Locale, string[]>; why: string }[] = [
  {
    words: { en: ['×'], 'fr-CA': ['×'], 'zh-Hans': ['×'] },
    why: "A chip's delete icon, which has no words.",
  },
  {
    words: {
      en: ['{YYYY}', '{YY}', '{MM}', '{DD}'],
      'fr-CA': ['{YYYY}', '{YY}', '{MM}', '{DD}'],
      'zh-Hans': ['{YYYY}', '{YY}', '{MM}', '{DD}'],
    },
    why: "What Numbering's date buttons put in the prefix, as the prefix shows it.",
  },
  {
    words: {
      en: ['See prices on orders', 'Receive stock against an order'],
      'fr-CA': [
        'Voir les prix des commandes',
        'Recevoir du stock sur une commande',
      ],
      'zh-Hans': ['查看订单价格', '按订单收货'],
    },
    why: "A permission's name, which the server sends from its own catalogue.",
  },
  {
    words: {
      en: ['Warehouse', 'Sales'],
      'fr-CA': ['Entrepôt', 'Ventes'],
      'zh-Hans': ['仓库', '销售'],
    },
    why: "A role template's name, which the server sends from its own catalogue.",
  },
  {
    words: {
      en: ['Permission', 'Made role', 'Template', 'Override', 'Exempt'],
      'fr-CA': [
        'Permission',
        'Rôle créé ici',
        'Modèle',
        'Dérogation',
        'Exonéré',
      ],
      'zh-Hans': ['权限', '本组织创建的角色', '模板', '例外批准', '免税'],
    },
    why: "A word Words you’ll meet explains, the glossary's name for an idea that the screens use inside sentences, or name by each of its kind.",
  },
  {
    words: { en: ['New'], 'fr-CA': ['Nouveau'], 'zh-Hans': ['新加入'] },
    why: "The first word of People's chip, New · joined and the day: the glossary's New (on People).",
  },
];

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
      return inlinesOf(guide).flatMap((part) => {
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

  it("put in bold only a screen's words, in the guide's language", () => {
    // A bold label is the screen's own word (3 November 2026), so a reader
    // finds it there, and a guide left behind by a renamed label fails.
    const notLabels = Object.entries(parsed).flatMap(([path, guide]) => {
      const locale = path.split('/')[2] as Locale;
      const kept = NOT_MESSAGES.flatMap(({ words }) => words[locale]);
      return inlinesOf(guide).flatMap((part) =>
        part.type === 'bold' &&
        !SHOWN[locale](part.text) &&
        !kept.includes(part.text)
          ? [`${path}: ${part.text}`]
          : [],
      );
    });

    expect(notLabels).toEqual([]);
  });

  it('list as kept only bold words a guide still has', () => {
    const bold = (locale: Locale) =>
      Object.entries(parsed)
        .filter(([path]) => path.split('/')[2] === locale)
        .flatMap(([, guide]) =>
          inlinesOf(guide).flatMap((part) =>
            part.type === 'bold' ? [part.text] : [],
          ),
        );
    const unused = SUPPORTED_LOCALES.flatMap((locale) =>
      NOT_MESSAGES.flatMap(({ words }) => words[locale])
        .filter((words) => !bold(locale).includes(words))
        .map((words) => `${locale}: ${words}`),
    );

    expect(unused).toEqual([]);
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
