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
 * welcome and Getting started, Help and the Account page, at a phone's
 * 390 × 844, in French, Chinese and en-XA, the pseudo-language, which is
 * about 40 % longer than English. A cut is text wider than its box with
 * the box's overflow hidden, or ended by an ellipsis. Each is fixed, or
 * listed in KNOWN with its issue.
 */

/** Each language, the account's own beside it, and the words waited for. */
const LANGUAGES = [
  {
    tag: 'fr-CA',
    account: 'fr-CA',
    signIn: 'Se connecter',
    start: 'Premiers pas',
    help: 'Aide',
    title: 'Compte',
  },
  {
    tag: 'zh-Hans',
    account: 'zh-Hans',
    signIn: '登录',
    start: '入门指引',
    help: '帮助',
    title: '我的账户',
  },
  {
    // To the server and the account, en-XA is English.
    tag: 'en-XA',
    account: 'en',
    signIn: '[Šíğñ íñ one]',
    start: '[Ğéťťíñğ šťáŕťéď one two]',
    help: '[Ĥéĺp one]',
    title: '[Áççóúñť one]',
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

/** Cuts filed to be designed, each with its issue. */
const KNOWN: {
  issue: string;
  is: (cut: Cut, organization: string) => boolean;
}[] = [
  {
    // The top bar's organization name gives way on a phone, by the design
    // language's Screen sizes; the design that replaces it is #490's.
    issue: '#490',
    is: (cut, organization) =>
      cut.landmark === 'banner' && cut.text === organization,
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
 * Once the screen has its words and the fonts that draw them: the cuts
 * under `root`, but those KNOWN, each said with the screen it is on.
 */
async function cuts(
  page: Page,
  screen: string,
  organization: string,
  root?: Locator,
): Promise<string[]> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  const found = root
    ? await root.evaluate(cutsIn)
    : await page.locator('body').evaluate(cutsIn);
  return found
    .filter((cut) => !KNOWN.some((known) => known.is(cut, organization)))
    .map((cut) => `${screen}: ${cut.where}: “${cut.text}”`);
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

for (const language of LANGUAGES) {
  test(`cuts no text on a newcomer's first screens at 390 × 844, in ${language.tag}`, async ({
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

    // The newcomer's phone, in the language, with no session.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: {
        cookies: [],
        origins: [
          {
            origin: new URL(baseURL!).origin,
            localStorage: [{ name: 'language', value: language.tag }],
          },
        ],
      },
    });
    const page = await context.newPage();
    const found: string[] = [];

    await page.goto('/login');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language.signIn,
    );
    found.push(...(await cuts(page, 'Sign in', org.organizationName)));

    await page.goto(`/invitation?token=${token}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      org.organizationName,
    );
    found.push(...(await cuts(page, 'The invitation', org.organizationName)));

    const member = await joinByLink(token, 'Wang Fang');
    await signInAs(page, member);
    await page.goto('/');
    await expect(
      page.getByRole('region', { name: org.organizationName, exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: language.start, exact: true }),
    ).toBeVisible();
    found.push(...(await cuts(page, 'Home', org.organizationName)));

    await page
      .getByRole('button', { name: language.help, exact: true })
      .click();
    const help = page.getByRole('dialog');
    await expect(help.getByRole('heading').first()).toBeVisible();
    found.push(...(await cuts(page, 'Help', org.organizationName, help)));
    await page.keyboard.press('Escape');
    await expect(help).toBeHidden();

    await page.goto('/account');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      language.title,
    );
    found.push(...(await cuts(page, 'The Account page', org.organizationName)));

    await context.close();
    await member.dispose();
    expect(found, 'text cut by its box').toEqual([]);
  });
}
