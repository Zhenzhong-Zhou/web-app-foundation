import { verificationMail } from '../../core/auth/account-mail';
import { invitationMail } from '../../core/invitations/invitation-mail';
import { type MailBlock, type MailContent, writeMail } from './mail-layout';

const MARK = 'https://app.example.com/brand/mail-mark.png';
const LINK = 'https://app.example.com/verify-email?token=abc&next=1';
/** Half the 102 KB at which Gmail cuts a message off (ADR-083). */
const LIMIT = 50 * 1024;

/** Every kind of block, in the order an email holds them. */
const BLOCKS: MailBlock[] = [
  { kind: 'header', name: 'Panivo', mark: MARK },
  { kind: 'heading', text: 'Confirm your email address', htmlOnly: true },
  { kind: 'greeting', text: 'Hi Mei Lin,' },
  { kind: 'paragraph', text: 'Your account is ready. One step is left.' },
  {
    kind: 'button',
    label: 'Confirm your email address',
    href: LINK,
    lead: 'Confirm your email address:',
  },
  {
    kind: 'details',
    rows: [
      ['When', 'Mon, 26 Oct 2026 22:41:07 GMT'],
      ['IP address', '203.0.113.7'],
    ],
  },
  {
    kind: 'paragraph',
    text: [
      'If it was not, ',
      {
        text: 'reset your password',
        href: 'https://app.example.com/forgot-password',
      },
      ' now.',
    ],
    plain:
      'If it was not, reset your password now: https://app.example.com/forgot-password',
  },
  {
    kind: 'quote',
    title: 'From Chen Jie',
    text: 'Start on Monday.\nBring boots.',
  },
  { kind: 'small', text: 'We will never ask for your password by email.' },
  { kind: 'link', href: 'https://app.example.com/account' },
  { kind: 'footer', text: 'Sent for Northside Naturals by Panivo.' },
];

function email(content: Partial<MailContent> = {}) {
  return writeMail({
    to: 'mei.lin@example.com',
    subject: 'Confirm your email address',
    locale: 'en',
    blocks: BLOCKS,
    ...content,
  });
}

/** The HTML after `<body>`: what a mail app shows, the head left out. */
function bodyOf(html: string): string {
  return html.slice(html.indexOf('<body'));
}

/** The preheader's words, before its padding. */
function preheaderOf(html: string): string {
  const [, words] =
    /<body[^>]*>\n<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">(.*?)&#847;/.exec(
      html,
    ) ?? [];
  return words;
}

/** Each of `words` in turn, each after the one before. */
function expectInOrder(html: string, words: string[]): void {
  let from = 0;
  for (const word of words) {
    const at = html.indexOf(word, from);
    expect(at, `"${word}" after the words before it`).toBeGreaterThan(-1);
    from = at + word.length;
  }
}

/** One email from blocks (ADR-083). */
describe('writeMail', () => {
  it('writes the text part from the same blocks as the HTML, a blank line between each', () => {
    const mail = email();

    expect(mail.text).toBe(
      [
        'Panivo',
        'Hi Mei Lin,',
        'Your account is ready. One step is left.',
        `Confirm your email address:\n${LINK}`,
        'When: Mon, 26 Oct 2026 22:41:07 GMT\nIP address: 203.0.113.7',
        'If it was not, reset your password now: https://app.example.com/forgot-password',
        'From Chen Jie\nStart on Monday.\nBring boots.',
        'We will never ask for your password by email.',
        'https://app.example.com/account',
        'Sent for Northside Naturals by Panivo.',
      ].join('\n\n'),
    );
    expectInOrder(bodyOf(mail.html), [
      '>Panivo</td>',
      '<h1',
      'Confirm your email address</h1>',
      'Hi Mei Lin,',
      'Your account is ready. One step is left.',
      '>Confirm your email address</a>',
      'Mon, 26 Oct 2026 22:41:07 GMT',
      'If it was not, <a',
      '>reset your password</a> now.',
      'From Chen Jie</strong><br>Start on Monday.<br>Bring boots.',
      'We will never ask for your password by email.',
      '>https://app.example.com/account</a>',
      'If the button doesn’t open',
      'Sent for Northside Naturals by Panivo.',
    ]);
    expect(mail).toMatchObject({
      to: 'mei.lin@example.com',
      subject: 'Confirm your email address',
    });
  });

  it("keeps a heading in the text part unless it is the HTML's alone", () => {
    const { text } = email({
      blocks: [
        { kind: 'heading', text: 'Join Northside Naturals' },
        { kind: 'paragraph', text: 'Chen Jie invited you to join.' },
      ],
    });

    expect(text).toBe(
      'Join Northside Naturals\n\nChen Jie invited you to join.',
    );
  });

  it('escapes every value, in the text and in attributes', () => {
    const evil = '"><img src=x onerror=alert(1)>&\'';
    const escaped = '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&amp;&#39;';
    const { html, text } = email({
      subject: evil,
      blocks: [
        { kind: 'header', name: evil, mark: evil },
        { kind: 'heading', text: evil },
        { kind: 'greeting', text: evil },
        { kind: 'paragraph', text: [evil, { text: evil, href: evil }] },
        { kind: 'button', label: evil, href: evil },
        { kind: 'details', rows: [[evil, evil]] },
        { kind: 'quote', title: evil, text: `${evil}\n${evil}` },
        { kind: 'small', text: evil },
        { kind: 'link', href: evil },
        { kind: 'footer', text: evil },
      ],
    });

    // The mark's is the only image, its address escaped.
    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain(`<title>${escaped}</title>`);
    expect(html).toContain(`aria-label="${escaped}"`);
    expect(html).toContain(`<img src="${escaped}"`);
    expect(html).toContain(`href="${escaped}"`);
    // Every value escaped whole, the address line's and the preheader's too.
    expect(html.replaceAll(escaped, '')).not.toContain('onerror');
    // The text part is plain text: as typed.
    expect(text).toContain(`${evil}\n\n${evil}`);
    expect(text).not.toContain('&amp;');
  });

  it('names its language twice, on <html> and on the email itself, which Gmail keeps', () => {
    const { html } = email({ locale: 'zh-Hans' });

    expect(html).toMatch(/^<!doctype html>\n<html lang="zh-Hans" dir="ltr">\n/);
    expect(html.match(/ lang="zh-Hans" dir="ltr"/g)).toHaveLength(2);
  });

  it('is one article to a screen reader, named by its subject', () => {
    const { html } = email();

    expect(html).toContain(
      '<div role="article" aria-roledescription="email" aria-label="Confirm your email address" lang="en" dir="ltr"',
    );
    expect(html).toContain('<title>Confirm your email address</title>');
  });

  it('marks every layout table presentation, and leaves the details a table of data', () => {
    const tables = email().html.match(/<table\b[^>]*>/g)!;

    // The column, Outlook's, the header, the button, the quote and the footer.
    expect(tables).toHaveLength(7);
    expect(
      tables.filter((tag) => !tag.includes('role="presentation"')),
    ).toEqual(['<table style="border-collapse:collapse">']);
    expect(
      email().html.match(/<th scope="row"[^>]*>(When|IP address)<\/th>/g),
    ).toHaveLength(2);

    const { html } = email({
      blocks: BLOCKS.filter((block) => block.kind !== 'details'),
    });
    expect(
      html
        .match(/<table\b[^>]*>/g)!
        .every((tag) => tag.includes('role="presentation"')),
    ).toBe(true);
  });

  it('puts the address under a button in small print last, before the footer, in the HTML alone, as its own link', () => {
    const { html, text } = email({ locale: 'zh-Hans' });
    const href = LINK.replace('&', '&amp;');

    expectInOrder(bodyOf(html), [
      'We will never ask',
      '>https://app.example.com/account</a>',
      `<p class="muted" style="margin:0;font-size:14px;line-height:1.5;color:#5B6575">按钮打不开时，把这个地址复制到浏览器：<a class="link" href="${href}" style="color:#5546B8;text-decoration:underline;word-break:break-all">${href}</a></p>`,
      'Sent for Northside Naturals by Panivo.',
    ]);
    expect(text).not.toContain('按钮打不开时');
    expect(
      email({ blocks: BLOCKS.filter((block) => block.kind !== 'button') }).html,
    ).not.toContain('If the button doesn’t open');
  });

  it('stays under 50 KB', () => {
    expect(Buffer.byteLength(email().html)).toBeLessThan(LIMIT);
  });

  it('loads nothing but the mark', () => {
    const { html } = email();

    expect(html.match(/<img\b/g)).toHaveLength(1);
    expect(html.match(/\bsrc=/g)).toHaveLength(1);
    expect(html).toContain(`<img src="${MARK}"`);
    expect(html).not.toContain('url(');
    expect(html).not.toMatch(/<link\b/);

    const unmarked = email({
      blocks: [
        { kind: 'header', name: 'Panivo', mark: null },
        ...BLOCKS.slice(1),
      ],
    }).html;
    expect(unmarked).not.toMatch(/<img\b|\bsrc=/);
  });

  it("gives dark mail apps the app's dark colours, by class, beside the inline light ones", () => {
    const { html } = email();
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const rules = [
      ['.muted', 'color: #A3ACBA'],
      ['.link', 'color: #A299D8'],
      ['.button td', 'background-color: #A299D8'],
      ['.button a', 'color: #10141A'],
      ['.rule', 'border-color: #3A3F48'],
    ];

    expect(style).toContain('@media (prefers-color-scheme: dark) {');
    for (const [selector, rule] of rules) {
      expect(style).toContain(`\n  ${selector} { ${rule} !important; }`);
      expect(style).toContain(
        `\n[data-ogsc] ${selector}, [data-ogsb] ${selector} { ${rule} !important; }`,
      );
    }
    // Each class is on what it colours, whose light colour is inline.
    const body = bodyOf(html);
    expect(body).toContain(
      'class="muted" style="margin:0;font-size:14px;line-height:1.5;color:#5B6575"',
    );
    expect(body).toContain(
      'class="link" href="https://app.example.com/forgot-password" style="color:#5546B8',
    );
    expect(body).toMatch(
      /class="button"[^>]*><tr><td [^>]*background-color:#5546B8/,
    );
    expect(body).toContain(
      'class="rule" width="100%" style="padding:0 0 16px;border-bottom:1px solid #EEF0F4',
    );
  });

  it('opens its body with the preheader: the first paragraph after the greeting, whole, padded', () => {
    const { html } = email();

    expect(preheaderOf(html)).toBe('Your account is ready. One step is left.');
    expect(html).toContain(
      `Your account is ready. One step is left.${'&#847;&zwnj;&nbsp;'.repeat(90)}</div>`,
    );
    expect(email().text).not.toContain('&#847;');
  });

  it('takes the first paragraph whole where there is no greeting, in every language', () => {
    const operator = email({
      blocks: [
        { kind: 'header', name: 'Panivo', mark: null },
        {
          kind: 'paragraph',
          text: 'Chen Jie set up Northside Naturals. They are its Owner.',
        },
      ],
    });
    expect(preheaderOf(operator.html)).toBe(
      'Chen Jie set up Northside Naturals. They are its Owner.',
    );

    const chinese = email({
      locale: 'zh-Hans',
      blocks: [
        { kind: 'greeting', text: '梅琳，您好：' },
        {
          kind: 'paragraph',
          text: '您申请删除账户。账户将在2026年11月25日之后删除。',
        },
      ],
    });
    expect(preheaderOf(chinese.html)).toBe(
      '您申请删除账户。账户将在2026年11月25日之后删除。',
    );
  });

  it('previews an invitation from Dr. Wang by its whole lead, the name never cut at its full stop', () => {
    const { html } = invitationMail({
      locale: 'en',
      to: 'mei.lin@example.com',
      inviter: { name: 'Dr. Wang', email: 'wang.li@example.com' },
      organizationName: 'Northside Naturals',
      roles: [{ name: 'Admin', description: 'Day-to-day work.' }],
      system: 'Admin',
      note: null,
      timeZone: 'America/Vancouver',
      lastDay: '2026-11-02',
      link: 'https://app.example.com/invitation?token=abc',
      appName: 'Panivo',
    });

    expect(preheaderOf(html)).toBe(
      'Dr. Wang (wang.li@example.com) invited you to join as an Admin.',
    );
  });

  it("previews confirm by its button's words, which come before its paragraph", () => {
    const { html } = writeMail(
      verificationMail({
        locale: 'en',
        to: 'mei.lin@example.com',
        name: 'Mei Lin',
        clientUrl: 'https://app.example.com',
        token: 'abc',
      }),
    );

    expect(preheaderOf(html)).toBe('Confirm your email address');
  });
});
