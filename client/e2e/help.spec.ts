import { expect, test } from './fixtures';
import { signInAs } from './support/api';
import { everyPage } from './support/every-page';

/**
 * Help (ADR-079): the page's guide in a panel from the top bar, following
 * the person from page to page, and Learn more opening it at a section.
 *
 * Reads only, so the first runs in the shared organization; the second
 * needs Getting started, which only a new organization shows.
 */
test('Help on Orders, then Inventory’s guide on Inventory', async ({
  page,
}) => {
  await page.goto('/orders');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const button = page.getByRole('button', { name: 'Help', exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');

  const help = page.getByRole('complementary', { name: 'Help', exact: true });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Orders', exact: true }),
  ).toBeFocused();
  await expect(
    help.getByRole('heading', {
      level: 3,
      name: 'Raise an order',
      exact: true,
    }),
  ).toBeVisible();

  // The page still works beside it: the rail takes the person on, and Help
  // follows with the next page's guide.
  await page
    .getByRole('navigation', { name: 'Main', exact: true })
    .getByRole('link', { name: 'Inventory', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Inventory', exact: true }),
  ).toBeVisible();
  await expect(
    help.getByRole('heading', { level: 2, name: 'Inventory', exact: true }),
  ).toBeVisible();

  // Esc from inside it shuts it, and focus is back on the button.
  await help.getByRole('heading', { level: 2 }).click();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('Learn more on a Getting started step opens Help at its section', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/');

  // Beside the next step's button, a new organization's first: its
  // profile (ADR-091).
  const step = page
    .getByRole('region', { name: 'Getting started', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'Address, tax number and currency' });
  await step.getByRole('button', { name: 'Learn more', exact: true }).click();

  const help = page.getByRole('complementary', { name: 'Help', exact: true });
  await expect(
    help.getByRole('heading', { level: 2, name: 'Organization', exact: true }),
  ).toBeAttached();
  const section = help.getByRole('heading', {
    level: 3,
    name: 'Profile',
    exact: true,
  });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport();

  // Closed, focus goes back to the Learn more that opened it.
  await help.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(
    step.getByRole('button', { name: 'Learn more', exact: true }),
  ).toBeFocused();
});

/**
 * Where the window leaves the page less than 720 px beside Help, Help is a
 * modal side sheet (ADR-091, #272): the Duo open, 890 px, and a small
 * tablet's 1024. The page is dimmed and nothing in it takes focus, so no
 * control can be focused under Help (WCAG 2.4.11); Esc closes it, and focus
 * is back on Help in the top bar. MUI hides the page from assistive
 * technology meanwhile, which Chrome refuses while something in it keeps
 * focus, so the test turns Chrome's accessibility tree on, as
 * keyboard.spec's drawer test does, to hear the refusal.
 */
for (const size of [
  { width: 890, height: 626 },
  { width: 1024, height: 768 },
]) {
  test(`at ${size.width} px Help is a modal side sheet: the page takes no focus, Esc closes it, focus is back on Help`, async ({
    page,
  }) => {
    const refused: string[] = [];
    page.on('console', (message) => {
      if (message.text().includes('Blocked aria-hidden')) {
        refused.push(message.text());
      }
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Accessibility.enable');

    await page.setViewportSize(size);
    await page.goto('/orders');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const button = page
      .getByRole('banner')
      .getByRole('button', { name: 'Help', exact: true });
    await button.click();

    const sheet = page.getByRole('dialog', { name: 'Help · Orders' });
    await expect(
      sheet.getByRole('heading', { level: 2, name: 'Orders', exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('complementary', { name: 'Help', exact: true }),
    ).toHaveCount(0);

    // Dimmed: what is pressed on the page is the dimming, not the page.
    const covering = await page.evaluate(() => {
      const box = document.querySelector('main h1')!.getBoundingClientRect();
      return document
        .elementFromPoint(box.left + 4, box.top + box.height / 2)
        ?.classList.contains('MuiBackdrop-root');
    });
    expect(covering).toBe(true);

    // Tab and Shift+Tab, each past either end of Help, stay inside it.
    const inSheet = () =>
      sheet.evaluate((element) => element.contains(document.activeElement));
    const links = await sheet.locator('a[href], button').count();
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let i = 0; i < links + 2; i += 1) {
        await page.keyboard.press(key);
        expect(await inSheet(), `${key} ${i + 1}`).toBe(true);
      }
    }
    // Nor does the page take focus given it from a script.
    await page.locator('main h1').evaluate((heading) => {
      const raise = heading
        .closest('main')!
        .querySelector<HTMLElement>('a[href], button');
      raise?.focus();
    });
    await expect.poll(inSheet).toBe(true);

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    // Past the close, so a refusal made during it has been heard.
    await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden');
    expect(refused).toEqual([]);
  });
}

test('a dialog opened beside Help leaves Help readable above its dimming', async ({
  page,
}) => {
  await page.goto('/locations');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Help', exact: true }).click();

  // By id, not by role: while a dialog is open, MUI hides the page, Help
  // with it, from assistive technology, and roles go with it.
  const help = page.locator('#help-panel');
  const title = help.locator('h2');
  await expect(title).toHaveText('Locations');

  // Beside the page at this width, Help leaves Add location in view, and
  // the keyboard reaches it.
  await page.getByRole('button', { name: 'Add location', exact: true }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Help's words are on top, not under the dimming, and the dialog sits
  // beside Help rather than under it.
  await expect(title).toBeVisible();
  const box = (await title.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const onTop = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('#help-panel'),
    point,
  );
  expect(onTop).toBe(true);
  const panel = (await help.boundingBox())!;
  const paper = (await dialog.boundingBox())!;
  expect(paper.x + paper.width).toBeLessThanOrEqual(panel.x);

  // It scrolls under the mouse, and the keyboard stays in the dialog.
  const scroller = help.locator('[data-help-scroller]');
  await page.mouse.move(point.x, point.y + 200);
  await page.mouse.wheel(0, 600);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);

  // Closed, the dialog leaves Help as it was, under the page's own menus.
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('complementary', { name: 'Help', exact: true })
      .getByRole('heading', { level: 2, name: 'Locations', exact: true }),
  ).toBeVisible();
  expect(
    await help.evaluate((element) => getComputedStyle(element).zIndex),
  ).toBe('1099');
});

/** The panel's id, as src/help/help-ids.ts names it. */
const HELP_PANEL_ID = 'help-panel';

/**
 * Every page with Help open on a small laptop, 1280 × 800 (ADR-079): the
 * rail folds and the page takes the width beside Help, so nothing scrolls
 * sideways, the title row's actions are in view and not under Help, and a
 * control focused in the page is never under it (WCAG 2.4.11). Each page
 * from the router's own list, so a page added later is walked too.
 */
test('every page keeps its width beside Help at 1280 × 800', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(240_000);
  const pages = await everyPage(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.setViewportSize({ width: 1280, height: 800 });

  const problems: string[] = [];
  for (const { path, url } of pages) {
    if (!url) {
      problems.push(`${path}: no record to open it with`);
      continue;
    }
    await page.goto(url);
    await expect(page.getByRole('main').locator('h1')).toBeVisible();
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Help', exact: true })
      .click();
    await expect(
      page
        .getByRole('complementary', { name: 'Help', exact: true })
        .getByRole('heading', { level: 2 }),
    ).toBeVisible();
    // The rail folds and the page moves beside Help, a frame or two later.
    const beside = await page
      .waitForFunction(
        (id) => {
          const panel = document.getElementById(id)?.getBoundingClientRect();
          const main = document.querySelector('main')?.getBoundingClientRect();
          return !!panel && !!main && main.right <= panel.left + 1;
        },
        HELP_PANEL_ID,
        { timeout: 5_000 },
      )
      .then(() => true)
      .catch(() => false);
    if (!beside) problems.push(`${url}: Help over the page, not beside it`);
    problems.push(
      ...(await page.evaluate(besideHelp, HELP_PANEL_ID)).map(
        (problem) => `${url}: ${problem}`,
      ),
    );
  }

  expect(problems).toEqual([]);

  // The rail folded for Help, its top the organization's plate (ADR-082),
  // and comes back as it was once Help closes.
  await expect(
    page.getByRole('button', { name: /Expand navigation \(/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Collapse navigation', exact: true }),
  ).toBeVisible();
});

/** What a page beside Help must hold, read in the page itself. */
function besideHelp(panelId: string): string[] {
  const problems: string[] = [];
  const panel = document.getElementById(panelId)!.getBoundingClientRect();
  const root = document.scrollingElement!;
  if (root.scrollWidth > root.clientWidth) {
    problems.push(
      `scrolls sideways, ${root.scrollWidth} in ${root.clientWidth}`,
    );
  }

  const name = (element: Element) =>
    `${element.tagName.toLowerCase()} "${(element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 40)}"`;
  const underHelp = (element: Element) => {
    const box = element.getBoundingClientRect();
    return (
      box.width > 0 &&
      box.height > 0 &&
      box.right > panel.left + 0.5 &&
      box.left < panel.right &&
      box.bottom > panel.top &&
      box.top < panel.bottom
    );
  };

  // The title row: from the page's heading up to the row as wide as the
  // page, with whatever it holds beside the title.
  const main = document.querySelector('main')!;
  const width = main.getBoundingClientRect().width * 0.85;
  let row: Element = main.querySelector('h1')!;
  while (
    row.parentElement &&
    row.parentElement !== main &&
    row.getBoundingClientRect().width < width
  ) {
    row = row.parentElement;
  }
  for (const action of row.querySelectorAll(
    'a[href], button, [role="button"], input, select',
  )) {
    const box = action.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;
    if (box.left < 0 || box.right > window.innerWidth) {
      problems.push(`title row: ${name(action)} out of view`);
    }
    if (underHelp(action))
      problems.push(`title row: ${name(action)} under Help`);
    const top = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    if (top && !action.contains(top) && !top.contains(action)) {
      problems.push(`title row: ${name(action)} covered by ${name(top)}`);
    }
  }

  // Every control the page lets focus reach, focused in turn.
  for (const control of main.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])',
  )) {
    if (control.getClientRects().length === 0) continue;
    control.focus();
    if (document.activeElement !== control) continue;
    if (underHelp(control)) problems.push(`focus under Help: ${name(control)}`);
  }
  (document.activeElement as HTMLElement | null)?.blur();
  return problems;
}
