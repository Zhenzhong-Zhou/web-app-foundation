import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  inviteByLink,
  joinByLink,
  registerOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';

/**
 * Text cut by its box on a newcomer's first screens (ADR-054's November
 * 2026 amendment, R9): signing in, accepting an invitation, Home with its
 * welcome and Getting started, Help, and the Account page with its Change
 * password dialog, at a phone's 390 × 844 and at 320 × 640, WCAG 1.4.10's
 * reflow width, each at the Standard and the Larger text size (ADR-075),
 * in English, French, Chinese and en-XA, the pseudo-language, which is
 * about 40 % longer than English. A cut is text wider than its box with the
 * box's overflow hidden, or ended by an ellipsis; or the page, or a
 * dialog, wider than the screen, so it scrolls sideways (WCAG 1.4.10,
 * Reflow), as en-XA's top bar once did. Each is fixed, or listed in KNOWN
 * with its issue.
 */

/** Each screen size walked: a phone's, and WCAG 1.4.10's reflow width. */
const WIDTHS = [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
] as const;

/** Each text size walked, as kept on the device (ADR-075), and its 1rem. */
const TEXT_SIZES = [
  { name: 'Standard', stored: null, rem: '16px' },
  { name: 'Larger', stored: 'larger', rem: '20px' },
] as const;

/** Each language, the account's own beside it, and the words waited for. */
const LANGUAGES = [
  {
    tag: 'en',
    account: 'en',
    signIn: 'Sign in',
    start: 'Getting started',
    help: 'Help',
    title: 'Account',
    changePassword: 'Change password',
  },
  {
    tag: 'fr-CA',
    account: 'fr-CA',
    signIn: 'Se connecter',
    start: 'Premiers pas',
    help: 'Aide',
    title: 'Compte',
    changePassword: 'Changer le mot de passe',
  },
  {
    tag: 'zh-Hans',
    account: 'zh-Hans',
    signIn: '登录',
    start: '入门指引',
    help: '帮助',
    title: '我的账户',
    changePassword: '修改密码',
  },
  {
    // To the server and the account, en-XA is English.
    tag: 'en-XA',
    account: 'en',
    signIn: '[Šíğñ íñ one]',
    start: '[Ğéťťíñğ šťáŕťéď one two]',
    help: '[Ĥéĺp one]',
    title: '[Áççóúñť one]',
    changePassword: '[Çĥáñğé páššŵóŕď one two]',
  },
] as const;

/** A text cut by its box, as the page measured it. */
interface Cut {
  /** Its words, as shown, at most 80 characters. */
  text: string;
  /** The landmark or dialog it sits in, then the box, by its MUI class. */
  where: string;
  /** The role of the landmark or dialog it sits in. */
  landmark: string;
}

/** Where a cut was measured: the screen, on which walk. */
interface Where {
  screen: string;
  /** The walk's organization, whose name the top bar shows. */
  organization: string;
  width: number;
  textSize: (typeof TEXT_SIZES)[number]['name'];
}

/** Cuts filed to be designed, each with its issue. */
const KNOWN: {
  issue: string;
  is: (cut: Cut, where: Where) => boolean;
}[] = [
  {
    // The top bar's organization name gives way on a phone, by the design
    // language's Screen sizes; the design that replaces it is #490's.
    issue: '#490',
    is: (cut, { organization }) =>
      cut.landmark === 'banner' && cut.text === organization,
  },
  {
    // Raised above its field, Confirm new password is still wider than the
    // field in Change password's dialog at 320 px and Larger text, in
    // French and en-XA: its label and the outline's gap for it. #566's
    // 14 px raised label would cut more; labels above the field that wrap,
    // an ADR-090 amendment, would clear both.
    issue: '#566',
    is: (cut, { screen, width, textSize }) =>
      screen === 'Change password' &&
      width === 320 &&
      textSize === 'Larger' &&
      [
        'Confirmer le nouveau mot de passe *',
        '[Çóñfíŕm ñéŵ páššŵóŕď one two] *',
      ].includes(cut.text),
  },
];

/**
 * The cuts under `root`, measured in the page, so it is self-contained.
 * A box counts when its overflow is hidden or clipped and a line of text
 * inside it runs past its left or right edge, or when it ends its text with
 * an ellipsis, on one line or after a few. Text a screen reader alone reads,
 * in a box a pixel wide, is no cut.
 */
function cutsIn(root: Element): Cut[] {
  const LANDMARKS: Record<string, string> = {
    HEADER: 'banner',
    NAV: 'navigation',
    MAIN: 'main',
    FOOTER: 'contentinfo',
    FORM: 'form',
  };
  const tiny = (element: Element) =>
    element.clientWidth <= 1 || element.clientHeight <= 1;
  const clipped = (style: CSSStyleDeclaration) =>
    /hidden|clip/.test(style.overflowX) || /hidden|clip/.test(style.overflowY);

  /** Text inside a box a screen reader alone reads. */
  const unseen = (node: Node, box: Element) => {
    for (
      let element = node.parentElement;
      element && element !== box;
      element = element.parentElement
    ) {
      const style = getComputedStyle(element);
      if (
        (tiny(element) && clipped(style)) ||
        style.clip !== 'auto' ||
        style.clipPath !== 'none'
      ) {
        return true;
      }
    }
    return false;
  };

  /** A line of text past the box's left or right edge. */
  const runsPast = (box: HTMLElement) => {
    const outer = box.getBoundingClientRect();
    const left = outer.left + box.clientLeft;
    const right = left + box.clientWidth;
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || unseen(node, box)) continue;
      range.selectNodeContents(node);
      for (const line of range.getClientRects()) {
        if (line.width > 0 && (line.right > right + 1 || line.left < left - 1))
          return true;
      }
    }
    return false;
  };

  const found: HTMLElement[] = [];
  for (const element of [root, ...root.querySelectorAll('*')]) {
    if (!(element instanceof HTMLElement) || tiny(element)) continue;
    if (!element.checkVisibility({ opacityProperty: true })) continue;
    if (!element.innerText.trim()) continue;
    const style = getComputedStyle(element);
    if (!clipped(style)) continue;
    const ellipsis =
      (style.textOverflow === 'ellipsis' &&
        element.scrollWidth > element.clientWidth + 1) ||
      (style.webkitLineClamp !== 'none' &&
        element.scrollHeight > element.clientHeight + 1);
    if (ellipsis || (/hidden|clip/.test(style.overflowX) && runsPast(element)))
      found.push(element);
  }

  // The innermost box of each: an outer one is cut by the same text.
  return found
    .filter(
      (box) => !found.some((other) => other !== box && box.contains(other)),
    )
    .map((box) => {
      const holder = box.closest(
        'header, nav, main, footer, form, [role="dialog"], [role="banner"], [role="navigation"], [role="main"]',
      );
      const landmark = holder
        ? (holder.getAttribute('role') ?? LANDMARKS[holder.tagName])
        : 'page';
      const named = [...box.classList].find((name) => /^Mui\w+-/.test(name));
      return {
        text: box.innerText.replace(/\s+/g, ' ').trim().slice(0, 80),
        where: `${landmark} › ${named ?? box.tagName.toLowerCase()}`,
        landmark,
      };
    });
}

/**
 * What makes `root` wider than the screen, measured in the page, so it is
 * self-contained: the page scrolling sideways, or, for a dialog, the dialog
 * itself, WCAG 1.4.10's loss. Each named by the innermost boxes past the
 * edge, leaving out what sits in a box that scrolls on its own and is
 * itself in view, as a wide table in its container does. Empty when it fits.
 */
function widerIn(root: Element): string[] {
  const page = root === document.body;
  const box = page ? document.documentElement : root;
  if (box.scrollWidth <= box.clientWidth + 1) return [];

  const left = page ? 0 : box.getBoundingClientRect().left + box.clientLeft;
  const right = left + box.clientWidth;
  const past = (element: Element) => {
    const { left: from, right: to, width } = element.getBoundingClientRect();
    return width > 0 && (to > right + 1 || from < left - 1);
  };
  const scrollsOnItsOwn = (element: Element) => {
    for (
      let up = element.parentElement;
      up && up !== box;
      up = up.parentElement
    ) {
      if (getComputedStyle(up).overflowX !== 'visible' && !past(up))
        return true;
    }
    return false;
  };

  const what = [...root.querySelectorAll('*')]
    .filter(
      (element) =>
        element.checkVisibility() &&
        past(element) &&
        !scrollsOnItsOwn(element) &&
        ![...element.children].some(past),
    )
    .slice(0, 3)
    .map((element) => {
      const named = [...element.classList].find((name) =>
        /^Mui\w+-root$/.test(name),
      );
      const words = (
        element.getAttribute('aria-label') ??
        (element instanceof HTMLElement ? element.innerText : '')
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
      return `${named ?? element.tagName.toLowerCase()} “${words}”`;
    });
  return [
    `${Math.round(box.scrollWidth)} px wide in ${box.clientWidth}, past its edge: ${what.join(', ') || 'something'}`,
  ];
}

/**
 * Once the screen has its words and the fonts that draw them, and `root`
 * has appeared: the cuts under `root`, but those KNOWN, and what makes it
 * wider than the screen, each said with the screen it is on.
 */
async function cuts(
  page: Page,
  where: Where,
  root: Locator = page.locator('body'),
): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // A dialog is visible to Playwright from its first frame, while it is
  // still at opacity 0, where the measure would pass its text over as
  // unseen and find nothing.
  await expect
    .poll(() =>
      root.evaluate((element) =>
        element.checkVisibility({ opacityProperty: true }),
      ),
    )
    .toBe(true);
  const found = await root.evaluate(cutsIn);
  const wider = await root.evaluate(widerIn);
  return [
    ...found
      .filter((cut) => !KNOWN.some((known) => known.is(cut, where)))
      .map((cut) => `${where.screen}: ${cut.where}: “${cut.text}”`),
    ...wider.map((what) => `${where.screen}: ${what}`),
  ];
}

test('the measure finds text cut by its box, and none a screen reader alone reads', async ({
  page,
}) => {
  await page.setContent(`
    <div style="width: 300px; font: 16px sans-serif">
      <p style="width: 60px; overflow: hidden; white-space: nowrap">Tracer un lot entier</p>
      <p style="width: 60px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis">Rechercher partout</p>
      <p style="width: 100px; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 1">Une phrase assez longue pour deux lignes</p>
      <p style="width: 100px; overflow: hidden">Fits</p>
      <p style="width: 60px; white-space: nowrap">Wider, and shown in full</p>
      <div style="width: 60px; overflow: hidden">
        <span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap">Read by a screen reader alone</span>
        Short
      </div>
    </div>
  `);

  const found = await page.locator('body').evaluate(cutsIn);

  expect(found.map(({ text }) => text)).toEqual([
    'Tracer un lot entier',
    'Rechercher partout',
    'Une phrase assez longue pour deux lignes',
  ]);
});

test('the measure finds a page or a dialog wider than the screen, and none a box scrolling on its own', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  /** A page that fits, wide things scrolling in their own boxes, and `more`. */
  const content = (more = '', dialog = '<p>Fits</p>') => `
    <body style="margin: 0; font: 16px sans-serif">
      <div style="overflow-x: auto"><table><tr><td style="white-space: nowrap">A wide table, scrolled in its own box</td><td style="width: 400px">Qty</td></tr></table></div>
      <div id="dialog" role="dialog" style="width: 300px; overflow: auto">
        <div style="overflow-x: auto"><span style="display: inline-block; width: 500px">Scrolled in its own box</span></div>
        ${dialog}
      </div>
      ${more}
    </body>
  `;

  await page.setContent(content());
  expect(await page.locator('body').evaluate(widerIn)).toEqual([]);
  expect(await page.locator('#dialog').evaluate(widerIn)).toEqual([]);

  await page.setContent(
    content(
      '<header style="display: flex"><button style="flex: none; width: 523px">Account</button></header>',
      '<p style="width: 420px">Notifications de la semaine</p>',
    ),
  );
  expect(await page.locator('body').evaluate(widerIn)).toEqual([
    '523 px wide in 320, past its edge: button “Account”',
  ]);
  expect(await page.locator('#dialog').evaluate(widerIn)).toEqual([
    expect.stringMatching(
      /^\d+ px wide in 300, past its edge: p “Notifications de la semaine/,
    ),
  ]);
});

for (const language of LANGUAGES) {
  for (const size of TEXT_SIZES) {
    for (const { width, height } of WIDTHS) {
      test(`cuts no text on a newcomer's first screens at ${width} × ${height}, ${size.name} text, in ${language.tag}`, async ({
        browser,
        baseURL,
      }) => {
        // An organization of its own whose Owner is confirmed, as inviting needs.
        const org = await registerOrganization('cut');
        await confirmEmailInDatabase(org.email);
        const { token } = await inviteByLink(
          org.api,
          uniqueEmail('newcomer'),
          'Admin',
          {
            locale: language.account,
          },
        );

        // The newcomer's phone, in the language and at the text size, with no
        // session.
        const context = await browser.newContext({
          viewport: { width, height },
          // Transitions end at once (ADR-075), so nothing is measured while
          // it slides or fades in.
          reducedMotion: 'reduce',
          storageState: {
            cookies: [],
            origins: [
              {
                origin: new URL(baseURL!).origin,
                localStorage: [
                  { name: 'language', value: language.tag },
                  ...(size.stored
                    ? [{ name: 'textSize', value: size.stored }]
                    : []),
                ],
              },
            ],
          },
        });
        const page = await context.newPage();
        const found: string[] = [];
        const walk = {
          organization: org.organizationName,
          width,
          textSize: size.name,
        };

        await page.goto('/login');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          language.signIn,
        );
        await expect(page.locator('html')).toHaveCSS('font-size', size.rem);
        found.push(...(await cuts(page, { ...walk, screen: 'Sign in' })));

        await page.goto(`/invitation?token=${token}`);
        await expect(page.getByRole('heading', { level: 1 })).toContainText(
          org.organizationName,
        );
        found.push(
          ...(await cuts(page, { ...walk, screen: 'The invitation' })),
        );

        const member = await joinByLink(token, 'Wang Fang');
        await signInAs(page, member);
        await page.goto('/');
        await expect(
          page.getByRole('region', {
            name: org.organizationName,
            exact: false,
          }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: language.start, exact: true }),
        ).toBeVisible();
        found.push(...(await cuts(page, { ...walk, screen: 'Home' })));

        await page
          .getByRole('button', { name: language.help, exact: true })
          .click();
        const help = page.getByRole('dialog');
        await expect(help.getByRole('heading').first()).toBeVisible();
        found.push(...(await cuts(page, { ...walk, screen: 'Help' }, help)));
        await page.keyboard.press('Escape');
        await expect(help).toBeHidden();

        await page.goto('/account');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(
          language.title,
        );
        found.push(
          ...(await cuts(page, { ...walk, screen: 'The Account page' })),
        );

        // Its three password fields, the longest labels on the walk.
        await page
          .getByRole('button', { name: language.changePassword, exact: true })
          .click();
        const changing = page.getByRole('dialog');
        await expect(
          changing.getByRole('heading', { name: language.changePassword }),
        ).toBeVisible();
        found.push(
          ...(await cuts(
            page,
            { ...walk, screen: 'Change password' },
            changing,
          )),
        );

        await context.close();
        await member.dispose();
        expect(found, 'text cut by its box, or wider than the screen').toEqual(
          [],
        );
      });
    }
  }
}
