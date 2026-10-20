/**
 * The Markdown a guide may use (ADR-079), and nothing more: a title, sections
 * each with an id, paragraphs, lists of one level, bold, notes, and links to
 * pages of the app. Read here rather than by a library, which would bring
 * dozens of packages for a subset this small.
 *
 * Whatever falls outside the subset is kept as the words it was written
 * with, never as markup, and named in `problems`, which the guides' check
 * (guides.test.ts) requires to be empty. So a guide never draws HTML, an
 * image or a link off the app, and a mistake in one shows as text rather
 * than as nothing.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  /** `[words](/path)` or `[words](/path#id)`: a page of the app. */
  | { type: 'link'; text: string; path: string; section: string | null };

export type Block =
  /** `## Words {#id}`: a section, the id the same in every language. */
  | { type: 'section'; id: string; text: string }
  | { type: 'paragraph'; text: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  /** `> words`: one paragraph set apart, used for what needs a permission. */
  | { type: 'note'; text: Inline[] }
  /** A line outside the subset, shown as it was written. */
  | { type: 'plain'; text: string };

export interface ParsedGuide {
  /** `# Title`, the first line. */
  title: string;
  blocks: Block[];
  /** Each line outside the subset, with its number; empty for a good guide. */
  problems: string[];
}

/** Lower case, words joined by hyphens: `idle-sign-out`. */
const ID = '[a-z0-9]+(?:-[a-z0-9]+)*';
const SECTION = new RegExp(`^## (\\S.*?) \\{#(${ID})\\}$`);
const ITEM = /^- (\S.*)$/;
const NUMBERED = /^\d+\. (\S.*)$/;
const NOTE = /^> (\S.*)$/;

/**
 * Bold, then a link to a path of the app with an optional section. Bold
 * holds plain words only, and so does a link: neither nests. A `!` before
 * the link makes it an image, which is left as words.
 */
const INLINE = new RegExp(
  `\\*\\*([^*]+)\\*\\*|(?<!!)\\[([^\\]]+)\\]\\((/[a-z0-9/-]*)(?:#(${ID}))?\\)`,
  'g',
);

/**
 * What is left in the words once bold and links are read, and would be
 * Markdown or HTML elsewhere: emphasis, code, an image or a link that is
 * not to the app, a tag, a strikethrough.
 */
const STRAY = /[*_`<>[\]]|~~/;

function inline(text: string, line: number, problems: string[]): Inline[] {
  const parts: Inline[] = [];
  let at = 0;
  const words = (from: number, to: number) => {
    if (to <= from) return;
    const piece = text.slice(from, to);
    if (STRAY.test(piece)) {
      problems.push(`line ${line}: Markdown outside the subset: ${piece}`);
    }
    parts.push({ type: 'text', text: piece });
  };

  for (const match of text.matchAll(INLINE)) {
    words(at, match.index);
    const [, bold, label, path, section] = match;
    parts.push(
      bold !== undefined
        ? { type: 'bold', text: bold }
        : { type: 'link', text: label, path, section: section ?? null },
    );
    at = match.index + match[0].length;
  }
  words(at, text.length);

  return parts;
}

export function parseGuide(source: string): ParsedGuide {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  const problems: string[] = [];
  const ids = new Set<string>();

  let title = '';
  /** The paragraph, list or note being read, until a blank line ends it. */
  let open: Block | null = null;

  const plain = (text: string, line: number, why: string) => {
    problems.push(`line ${line}: ${why}: ${text}`);
    blocks.push({ type: 'plain', text });
    open = null;
  };

  lines.forEach((text, index) => {
    const line = index + 1;

    if (line === 1) {
      if (text.startsWith('# ') && text.length > 2) {
        title = text.slice(2).trim();
      } else {
        plain(text, line, 'a guide starts with its # Title');
      }
      return;
    }

    if (text.trim() === '') {
      open = null;
      return;
    }

    // A nested list, a code block, or a line wrapped with an indent.
    if (/^\s/.test(text)) {
      plain(text, line, 'nothing is indented');
      return;
    }

    if (text.startsWith('#')) {
      const section = SECTION.exec(text);
      if (!section) {
        plain(text, line, 'a heading is ## Words {#id}, once a title is set');
        return;
      }
      const [, words, id] = section;
      if (ids.has(id)) problems.push(`line ${line}: #${id} is used twice`);
      ids.add(id);
      blocks.push({ type: 'section', id, text: words });
      open = null;
      return;
    }

    const item = ITEM.exec(text) ?? NUMBERED.exec(text);
    if (item) {
      const ordered = /^\d/.test(text);
      const items = inline(item[1], line, problems);
      if (open?.type === 'list' && open.ordered === ordered) {
        open.items.push(items);
      } else {
        open = { type: 'list', ordered, items: [items] };
        blocks.push(open);
      }
      return;
    }

    const note = NOTE.exec(text);
    if (note) {
      const words = inline(note[1], line, problems);
      if (open?.type === 'note') {
        open.text.push({ type: 'text', text: ' ' }, ...words);
      } else {
        open = { type: 'note', text: words };
        blocks.push(open);
      }
      return;
    }

    // Another list marker, a table, a fence or a rule.
    if (/^([*+|]|```|---|___)/.test(text)) {
      plain(text, line, 'not in the subset');
      return;
    }

    const words = inline(text, line, problems);
    if (open?.type === 'paragraph') {
      open.text.push({ type: 'text', text: ' ' }, ...words);
    } else {
      open = { type: 'paragraph', text: words };
      blocks.push(open);
    }
  });

  return { title, blocks, problems };
}

/** The ids of a guide's sections, in order. */
export function sectionIds(guide: ParsedGuide): string[] {
  return guide.blocks.flatMap((block) =>
    block.type === 'section' ? [block.id] : [],
  );
}
