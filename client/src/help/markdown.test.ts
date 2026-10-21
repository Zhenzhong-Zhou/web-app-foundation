import { describe, expect, it } from 'vitest';

import { parseGuide, sectionIds } from './markdown';

const guide = (...lines: string[]) => parseGuide(lines.join('\n'));

describe('parseGuide', () => {
  it('reads the title, and sections with their ids', () => {
    const parsed = guide('# Orders', '', '## Raise an order {#raise}');

    expect(parsed.title).toBe('Orders');
    expect(parsed.blocks).toEqual([
      { type: 'section', id: 'raise', text: 'Raise an order' },
    ]);
    expect(sectionIds(parsed)).toEqual(['raise']);
    expect(parsed.problems).toEqual([]);
  });

  it('reads paragraphs, joining their lines', () => {
    const parsed = guide('# T', '', 'One line', 'and the next.', '', 'Two.');

    expect(parsed.blocks).toEqual([
      {
        type: 'paragraph',
        text: [
          { type: 'text', text: 'One line' },
          { type: 'text', text: ' ' },
          { type: 'text', text: 'and the next.' },
        ],
      },
      { type: 'paragraph', text: [{ type: 'text', text: 'Two.' }] },
    ]);
  });

  it('reads lists of either kind, one level, each its own list', () => {
    const parsed = guide('# T', '', '- a', '- b', '1. one', '2. two');

    expect(parsed.blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        items: [[{ type: 'text', text: 'a' }], [{ type: 'text', text: 'b' }]],
      },
      {
        type: 'list',
        ordered: true,
        items: [
          [{ type: 'text', text: 'one' }],
          [{ type: 'text', text: 'two' }],
        ],
      },
    ]);
    expect(parsed.problems).toEqual([]);
  });

  it('reads a note', () => {
    const parsed = guide('# T', '', '> Only an Owner sees **Save**.');

    expect(parsed.blocks).toEqual([
      {
        type: 'note',
        text: [
          { type: 'text', text: 'Only an Owner sees ' },
          { type: 'bold', text: 'Save' },
          { type: 'text', text: '.' },
        ],
      },
    ]);
  });

  it('reads links to pages of the app, with a section or without', () => {
    const parsed = guide(
      '# T',
      '',
      'See [Invoices](/invoices) and [numbering](/settings/organization#numbering).',
    );

    expect(parsed.blocks[0]).toEqual({
      type: 'paragraph',
      text: [
        { type: 'text', text: 'See ' },
        { type: 'link', text: 'Invoices', path: '/invoices', section: null },
        { type: 'text', text: ' and ' },
        {
          type: 'link',
          text: 'numbering',
          path: '/settings/organization',
          section: 'numbering',
        },
        { type: 'text', text: '.' },
      ],
    });
    expect(parsed.problems).toEqual([]);
  });

  it('keeps Chinese as written, with no space added', () => {
    const parsed = guide('# 订单', '', '点**创建订单**。');

    expect(parsed.title).toBe('订单');
    expect(parsed.blocks[0]).toEqual({
      type: 'paragraph',
      text: [
        { type: 'text', text: '点' },
        { type: 'bold', text: '创建订单' },
        { type: 'text', text: '。' },
      ],
    });
  });

  describe('refuses what is outside the subset, keeping it as words', () => {
    it.each([
      ['a third-level heading', '### Deeper'],
      ['a heading without an id', '## Words'],
      ['a second title', '# Again'],
      ['a nested list', '  - inner'],
      ['an indented code block', '    code'],
      ['a list marked with *', '* item'],
      ['a table', '| a | b |'],
      ['a fence', '```'],
      ['a rule', '---'],
    ])('%s', (_, line) => {
      const parsed = guide('# T', '', line);

      expect(parsed.blocks).toEqual([{ type: 'plain', text: line }]);
      expect(parsed.problems).toHaveLength(1);
      expect(parsed.problems[0]).toMatch(/^line 3: /);
    });

    it.each([
      ['emphasis', 'Some *stress* here.'],
      ['underscores', 'Some _stress_ here.'],
      ['code', 'Type `npm` here.'],
      ['HTML', 'A <b>bold</b> word.'],
      ['an image', '![logo](/logo.png)'],
      ['an image at a path like a page', '![logo](/logo)'],
      ['a link off the app', '[Site](https://example.com)'],
      ['a link to a page with capitals', '[Page](/Orders)'],
      ['strikethrough', 'Not ~~this~~ one.'],
    ])('%s', (_, line) => {
      const parsed = guide('# T', '', line);

      // Words, never markup: the whole line is there as text.
      const block = parsed.blocks[0];
      expect(block.type).toBe('paragraph');
      const words =
        block.type === 'paragraph'
          ? block.text
              .map((part) => (part.type === 'text' ? part.text : ''))
              .join('')
          : '';
      expect(words).toBe(line);
      expect(parsed.problems).toHaveLength(1);
    });

    it('a guide that does not start with its title', () => {
      const parsed = guide('Orders', '', '## Raise {#raise}');

      expect(parsed.title).toBe('');
      expect(parsed.problems).toEqual([
        'line 1: a guide starts with its # Title: Orders',
      ]);
    });

    it('Markdown in a heading, whose words are drawn as they are', () => {
      const parsed = guide('# The **orders**', '', '## Raise `it` {#raise}');

      expect(parsed.problems).toEqual([
        'line 1: a heading is words alone: The **orders**',
        'line 3: a heading is words alone: Raise `it`',
      ]);
    });

    it('an id used twice', () => {
      const parsed = guide('# T', '', '## A {#same}', '', '## B {#same}');

      expect(parsed.problems).toEqual(['line 5: #same is used twice']);
    });
  });
});
