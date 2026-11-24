import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  createProduct,
  inviteByLink,
  joinByLink,
  registerOrganization,
  type SeededOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { everyPage } from './support/every-page';
import { confirmEmailInDatabase } from './support/mail';
import { fiftyTwo, receive, reorderScene, stockScene } from './support/stock';

/**
 * The page frame (ADR-090, amended November 2026, #632): every signed-in
 * page sits in one 1,600 px frame, its gutters included, centred beside
 * the rail; Home and a page that is one form, named narrower in its route
 * (src/routes.ts), in `lg`'s 1,200, centred the same way. A page never
 * sets a width of its own (E5): what it draws spans the frame.
 *
 * At 1920 × 1080, where the 1,600 frame binds, with Help closed.
 */

/** The frame's width, and a narrower page's, gutters included. */
const FRAME = 1600;
const NARROWER = 1200;

test('every signed-in page sits in its route’s frame at 1920 × 1080', async ({
  page,
  freshOrg,
}) => {
  test.setTimeout(240_000);
  const pages = await everyPage(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.setViewportSize({ width: 1920, height: 1080 });

  const problems: string[] = [];
  for (const { path, url, narrower } of pages) {
    if (!url) {
      problems.push(`${path}: no record to open it with`);
      continue;
    }
    await page.goto(url);
    await expect(page.getByRole('main').locator('h1')).toBeVisible();
    problems.push(
      ...(await page.evaluate(inFrame, narrower ? NARROWER : FRAME)).map(
        (problem) => `${url}: ${problem}`,
      ),
    );
  }

  expect(problems).toEqual([]);
});

/**
 * Home for an account in no organization (ADR-078) is Home's route, so
 * Home's narrower frame, with no width of its own either.
 */
test('Home with no organization sits in Home’s frame at 1920 × 1080', async ({
  page,
}) => {
  const first = await registerOrganization('frame');
  await confirmEmailInDatabase(first.email);
  const member = await joinByLink(
    (await inviteByLink(first.api, uniqueEmail('frame'))).token,
  );
  const left = await member.delete('/v1/account/membership');
  expect(left.ok(), await left.text()).toBeTruthy();
  await signInAs(page, member);
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Join an organization', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(inFrame, NARROWER)).toEqual([]);
});

/**
 * What the page's frame must hold, read in the page: the main landmark
 * `width` px wide and centred in the room beside the rail, and each part
 * of the page as wide as the frame inside its gutters.
 */
function inFrame(width: number): string[] {
  const problems: string[] = [];
  const main = document.querySelector('main')!;
  const box = main.getBoundingClientRect();
  if (Math.abs(box.width - width) > 0.5) {
    problems.push(`the frame ${box.width} px wide, not ${width}`);
  }
  const room = main.parentElement!.getBoundingClientRect();
  const left = box.left - room.left;
  const right = room.right - box.right;
  if (Math.abs(left - right) > 1) {
    problems.push(`the frame not centred: ${left} px left, ${right} right`);
  }

  // Inside the gutters, where the layout's column holds the banners and
  // the page.
  const style = getComputedStyle(main);
  const inside =
    main.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight);
  for (const part of main.firstElementChild!.children) {
    const { position } = getComputedStyle(part);
    const shown = part.getBoundingClientRect();
    // Out of the flow, or not drawn: a live region, a hidden part.
    if (position === 'absolute' || position === 'fixed') continue;
    if (shown.width === 0 && shown.height === 0) continue;
    if (Math.abs(shown.width - inside) > 0.5) {
      const name = `${part.tagName.toLowerCase()}${part.className ? `.${String(part.className).split(' ')[0]}` : ''}`;
      problems.push(`${name} ${shown.width} px wide in a frame of ${inside}`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// A list's header under the top bar, and a table too wide for its box
// ---------------------------------------------------------------------------

/** A list page's table, by its name. */
const listTable = (page: Page, name: string) =>
  page.getByRole('table', { name, exact: true });

/** A list table's box, the shared table's `TableContainer`. */
const boxOf = (table: Locator) => table.locator('xpath=..');

/** The rows' item links, top to bottom: each name's alone. */
const itemLinks = (table: Locator) =>
  table.locator('tbody a[href^="/items/"]:not([href*="#"])');

/** The window's scroll, read once the frame has drawn. */
const scrolled = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => resolve(window.scrollY)),
      ),
  );

/**
 * Where the top bar ends and a table's header row stands, as the window
 * shows them, read from its first cell, which sticks while the row group
 * stays where the table puts it: the head's line (that cell's inset
 * shadow), the list's first row's top, and the stuck header's share of
 * the scroll margin.
 */
const headOf = (table: Locator) =>
  table.evaluate((element: HTMLTableElement) => {
    const head = element.tHead!.rows[0].cells[0].getBoundingClientRect();
    return {
      bar: document
        .querySelector('header.MuiAppBar-root')!
        .getBoundingClientRect().bottom,
      top: head.top,
      bottom: head.bottom,
      height: head.height,
      first: element.tBodies[0].rows[0].getBoundingClientRect().top,
      line: getComputedStyle(element.tHead!.rows[0].cells[0]).boxShadow,
      share: document.documentElement.style.getPropertyValue('--stuck-header'),
    };
  });

/** The window scrolled until a row of the list stands `y` px down it. */
const rowTo = (table: Locator, index: number, y: number) =>
  table.evaluate(
    (element: HTMLTableElement, [index, y]) =>
      window.scrollBy(
        0,
        element.tBodies[0].rows[index].getBoundingClientRect().top - y,
      ),
    [index, y] as const,
  );

/** The page scrolled by script, then until its header stays, by CSS. */
async function stuckAt(page: Page, table: Locator, y: number) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await expect(boxOf(table)).toHaveAttribute('data-stuck', 'true');
}

/** The header row standing right under the top bar, its line shown. */
async function staysUnderTheBar(table: Locator) {
  await expect
    .poll(async () => {
      const head = await headOf(table);
      return Math.abs(head.top - head.bar) <= 1;
    })
    .toBe(true);
  const head = await headOf(table);
  expect(head.line).toContain('inset');
  expect(Math.abs(parseFloat(head.share) - head.height)).toBeLessThanOrEqual(1);
}

/**
 * A list page's own table keeps its header under the top bar (ADR-090,
 * amended November 2026), each row of the amendment's interaction table a
 * test: Stock and Items of fifty-two codes, made once for the tests here,
 * which only read them, mostly at 1920 × 1080, where Stock fits its box
 * and the window is tall enough for its header to stay.
 */
test.describe('a list’s header under the top bar', () => {
  let owner: SeededOrganization;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    owner = await registerOrganization('header');
    await fiftyTwo(owner.api);
  });
  test.afterAll(async () => {
    await owner.api.dispose();
  });

  test.beforeEach(async ({ page }) => {
    await signInAs(page, owner.api);
  });

  /** Stock at 1920 × 1080, its first fifty codes drawn. */
  async function stock(page: Page) {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/inventory');
    const table = listTable(page, 'Stock');
    await expect(itemLinks(table)).toHaveCount(50);
    return table;
  }

  /** Items at a size, its first fifty drawn. */
  async function items(page: Page, width: number, height: number) {
    await page.setViewportSize({ width, height });
    await page.goto('/items');
    const table = listTable(page, 'Items');
    await expect(itemLinks(table)).toHaveCount(50);
    return table;
  }

  test('1 · scrolled past, the header stays under the top bar with its line; scrolled back, the line goes (R5)', async ({
    page,
  }) => {
    const table = await stock(page);
    await expect(boxOf(table)).toHaveAttribute('data-fits', 'true');
    await expect(boxOf(table)).not.toHaveAttribute('data-stuck');
    expect((await headOf(table)).line).toBe('none');

    await stuckAt(page, table, 1500);
    await staysUnderTheBar(table);

    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(boxOf(table)).not.toHaveAttribute('data-stuck');
    // The share goes in an effect's clean-up, which may follow the paint
    // that drops the attribute (#683).
    await expect.poll(async () => (await headOf(table)).share).toBe('');
    const head = await headOf(table);
    expect(head.line).toBe('none');
    expect(head.top).toBeGreaterThan(head.bar + 50);
  });

  /**
   * The list empties while it reads again, so where the page stands
   * after is the browser's; what holds is the first row under the header
   * and focus on the header (R18).
   */
  test('2 · a sort pressed from a stuck header: the first row under it, focus on the header; again, reversed (R18, E11a)', async ({
    page,
  }) => {
    const table = await stock(page);
    const header = table.getByRole('columnheader', { name: 'Item' });
    const button = header.getByRole('button');

    for (const [order, first] of [
      ['descending', 'E2E Page 52'],
      ['ascending', 'E2E Page 01'],
    ] as const) {
      await stuckAt(page, table, 1500);
      await button.click();
      await expect(header).toHaveAttribute('aria-sort', order);
      await expect(itemLinks(table).first()).toHaveText(first);
      await expect(itemLinks(table)).toHaveCount(50);
      await expect
        .poll(async () => {
          const head = await headOf(table);
          return Math.abs(head.first - head.bottom) <= 1;
        })
        .toBe(true);
      await expect(itemLinks(table).first()).toBeInViewport();
      await expect(button).toBeFocused();
    }
  });

  /**
   * The one scroll margin counts the stuck header's height so a row's
   * control stops below it; a control in the header itself sits above
   * that margin, and once it jumped the page to the table's top, about
   * 550 px in Chromium. Tab and Shift+Tab across the header move nothing.
   */
  test('a stuck header’s sort button, reached by Tab, leaves the page where it is', async ({
    page,
  }) => {
    const table = await stock(page);
    const item = table
      .getByRole('columnheader', { name: 'Item' })
      .getByRole('button');
    const onHand = table
      .getByRole('columnheader', { name: 'On hand' })
      .getByRole('button');
    await item.focus();
    await stuckAt(page, table, 1500);
    const at = await scrolled(page);

    await page.keyboard.press('Tab');
    await expect(onHand).toBeFocused();
    expect(Math.abs((await scrolled(page)) - at)).toBeLessThanOrEqual(3);

    await page.keyboard.press('Shift+Tab');
    await expect(item).toBeFocused();
    expect(Math.abs((await scrolled(page)) - at)).toBeLessThanOrEqual(3);
  });

  /**
   * Wholly below the header, not 8 px under it: Chromium and WebKit move
   * a control the least, to the margin; Firefox brings it to the middle
   * of the window (R8).
   */
  test('3 · Shift+Tab to a row’s control under a stuck header: it shows wholly below the header (R8)', async ({
    page,
  }) => {
    const table = await stock(page);
    await stuckAt(page, table, 1500);
    // Row 21 standing right under the bar, under the header that stays;
    // row 22's name below the header, focused.
    const { bar } = await headOf(table);
    await rowTo(table, 20, bar + 1);
    await expect(boxOf(table)).toHaveAttribute('data-stuck', 'true');
    await itemLinks(table).nth(21).focus();

    await page.keyboard.press('Shift+Tab');
    const focused = page.locator(':focus');
    await expect(focused).toHaveCount(1);
    expect(
      await focused.evaluate(
        (element) => element.closest('tr')!.sectionRowIndex,
      ),
    ).toBe(20);
    await expect
      .poll(async () => {
        const head = await headOf(table);
        return (await focused.boundingBox())!.y - head.bottom;
      })
      .toBeGreaterThanOrEqual(-0.5);
    await expect(focused).toBeInViewport({ ratio: 1 });
  });

  test('4 · Back from an item’s page opened from Stock: the row left from, focused, clear of the header', async ({
    page,
  }) => {
    const table = await stock(page);
    await stuckAt(page, table, 1500);
    const { bar } = await headOf(table);
    await rowTo(table, 30, bar + 300);
    const link = itemLinks(table).nth(30);
    await expect(link).toHaveText('E2E Page 31');
    await link.click();
    await expect(page).toHaveURL(/\/items\/[0-9a-f-]+$/);
    await expect(
      page.getByRole('heading', { level: 1, name: 'E2E Page 31' }),
    ).toBeVisible();

    await page.goBack();
    await expect(link).toBeFocused();
    await expect
      .poll(async () => {
        const head = await headOf(table);
        const top = Math.max(head.bar, head.bottom);
        return (await link.boundingBox())!.y - top;
      })
      .toBeGreaterThanOrEqual(-0.5);
    await expect(link).toBeInViewport({ ratio: 1 });
  });

  test('5 · a window under 500 px tall on a laptop, or 700 px on a tablet: the header goes with the page; taller, it stays again (R6)', async ({
    page,
  }) => {
    for (const [width, height] of [
      [1366, 500],
      [1180, 700],
    ] as const) {
      const table = await items(page, width, height - 1);
      await expect(boxOf(table)).toHaveAttribute('data-fits', 'true');
      await page.evaluate(() => window.scrollTo(0, 1200));
      await expect
        .poll(async () => {
          const head = await headOf(table);
          return head.bottom < head.bar;
        })
        .toBe(true);
      await expect(boxOf(table)).not.toHaveAttribute('data-stuck');
      expect((await headOf(table)).share).toBe('');

      await page.setViewportSize({ width, height });
      await page.evaluate(() => window.scrollBy(0, 40));
      await expect(boxOf(table)).toHaveAttribute('data-stuck', 'true');
      await staysUnderTheBar(table);
    }
  });

  test('7 · a tablet held sideways, 1180 × 820, the table fitting: the header stays (E9b)', async ({
    page,
  }) => {
    const table = await items(page, 1180, 820);
    await expect(boxOf(table)).toHaveAttribute('data-fits', 'true');
    await stuckAt(page, table, 1200);
    await staysUnderTheBar(table);
  });

  test('8 · Show 50 more under a stuck header: the new rows below, the header still stays', async ({
    page,
  }) => {
    const table = await stock(page);
    const more = page.getByRole('button', { name: 'Show 50 more' });
    await more.scrollIntoViewIfNeeded();
    await expect(boxOf(table)).toHaveAttribute('data-stuck', 'true');

    await more.click();
    await expect(itemLinks(table)).toHaveCount(52);
    await expect(itemLinks(table).nth(51)).toHaveText('E2E Page 52');
    await expect(boxOf(table)).toHaveAttribute('data-stuck', 'true');
    await staysUnderTheBar(table);
  });

  test('9 · on a phone: a card per row, no header; only the top bar stays', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/inventory');
    const main = page.getByRole('main');
    await expect(
      main.getByRole('link', { name: 'E2E Page 01', exact: true }),
    ).toBeVisible();
    await expect(main.getByRole('table')).toHaveCount(0);
    await expect(main.getByRole('columnheader')).toHaveCount(0);

    await page.evaluate(() => window.scrollTo(0, 2000));
    await expect
      .poll(async () => (await page.getByRole('banner').boundingBox())!.y)
      .toBe(0);
    expect(
      await page.evaluate(() =>
        document.documentElement.style.getPropertyValue('--stuck-header'),
      ),
    ).toBe('');
  });
});

/**
 * A table too wide, as the window shows it: the box's, the first row's
 * name cell's and its last cell's [left, right]; half the box; the
 * header's widths of the start, the tick box and the name, and of the
 * row's actions; and whether those are pinned.
 */
const sidesOf = (table: Locator) =>
  table.evaluate((element: HTMLTableElement) => {
    const span = (node: Element) => {
      const box = node.getBoundingClientRect();
      return [box.left, box.right] as const;
    };
    const head = element.tHead!.rows[0].cells;
    const tick = head[0].classList.contains('MuiTableCell-paddingCheckbox');
    const row = element.tBodies[0].rows[0].cells;
    const width = (cell: Element) => cell.getBoundingClientRect().width;
    return {
      box: span(element.parentElement!),
      half: element.parentElement!.clientWidth / 2,
      start: (tick ? width(head[0]) : 0) + width(head[tick ? 1 : 0]),
      actions: width(head[head.length - 1]),
      name: span(row[tick ? 1 : 0]),
      end: span(row[row.length - 1]),
      endPinned: getComputedStyle(head[head.length - 1]).position === 'sticky',
    };
  });

/**
 * Stock too wide at 1366 × 768, in English, as the demo's is (R17, E12a):
 * a code too long to break, as a supplier's can be, widens the item's
 * column past what the box has. A region named for its table with a tab
 * stop; the name pinned at the start and the row's Actions at the end,
 * each edge only while columns lie under it; a control reached by
 * Shift+Tab wholly clear of both. Its number columns as wide as at 1920
 * (R4).
 */
test('Stock too wide at 1366 × 768: a named region, the name and Actions pinned, a control clear of both; its number columns as at 1920 (R4, R17, E12a)', async ({
  page,
  freshOrg,
}) => {
  const scene = await stockScene(freshOrg.api);
  const calcium = await createProduct(freshOrg.api, {
    name: 'E2E Calcium',
    sku: 'E2ECALCIUMPANTOTHENATE500MGX120',
  });
  await receive(freshOrg.api, calcium, scene.shelfA, '4');
  await receive(freshOrg.api, calcium, scene.shelfB, '4');
  await signInAs(page, freshOrg.api);

  /** Each number column's width, by its header. */
  const numbers = (table: Locator) =>
    table.evaluate((element: HTMLTableElement) =>
      [...element.tHead!.rows[0].cells]
        .filter((cell) => cell.hasAttribute('data-number'))
        .map((cell) => [
          cell.textContent,
          Math.round(cell.getBoundingClientRect().width),
        ]),
    );

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/inventory');
  const table = listTable(page, 'Stock');
  await expect(itemLinks(table)).toHaveText([
    'E2E Calcium',
    'E2E Magnesium',
    'E2E Vitamin C',
  ]);
  await expect(boxOf(table)).toHaveAttribute('data-fits', 'true');
  const wide = await numbers(table);

  await page.setViewportSize({ width: 1366, height: 768 });
  const region = page.getByRole('region', { name: 'Stock, scrolls sideways' });
  await expect(region).toHaveAttribute('tabindex', '0');
  await expect(region.getByRole('table', { name: 'Stock' })).toBeVisible();
  const narrow = await numbers(table);
  expect(narrow.map(([name]) => name)).toEqual(wide.map(([name]) => name));
  for (const [index, [name, width]] of narrow.entries()) {
    expect(
      Math.abs(Number(width) - Number(wide[index][1])),
      `${name}`,
    ).toBeLessThanOrEqual(1);
  }

  // At rest: the first row's Actions wholly in view at the box's end,
  // pinned there while the two sides take no more than half the box.
  const rest = await sidesOf(table);
  expect(rest.start + rest.actions).toBeLessThanOrEqual(rest.half);
  expect(rest.endPinned).toBe(true);
  expect(Math.abs(rest.end[1] - rest.box[1])).toBeLessThanOrEqual(1);
  const actions = table.getByRole('button', {
    name: 'Actions for E2E Calcium',
  });
  await expect(actions).toBeInViewport({ ratio: 1 });
  expect((await actions.boundingBox())!.x).toBeGreaterThanOrEqual(rest.end[0]);
  await expect(region).toHaveAttribute('data-under-end', 'true');
  await expect(region).not.toHaveAttribute('data-under-start');

  // Scrolled to its end: the name still in view at the box's start.
  await region.evaluate((box) => {
    box.scrollLeft = box.scrollWidth;
  });
  await expect(region).toHaveAttribute('data-under-start', 'true');
  await expect(region).not.toHaveAttribute('data-under-end');
  const end = await sidesOf(table);
  expect(Math.abs(end.name[0] - end.box[0])).toBeLessThanOrEqual(1);
  await expect(itemLinks(table).first()).toBeInViewport({ ratio: 1 });

  // From its Actions, Shift+Tab back onto the first row's Where: wholly
  // clear of the pinned name and of the pinned Actions.
  const where = table.getByRole('button', {
    name: /: (show|hide) where E2E Calcium is$/,
  });
  await actions.focus();
  for (let press = 0; press < 8; press += 1) {
    if (await where.evaluate((button) => button === document.activeElement)) {
      break;
    }
    await page.keyboard.press('Shift+Tab');
  }
  await expect(where).toBeFocused();
  await expect
    .poll(async () => {
      const sides = await sidesOf(table);
      const control = (await where.boundingBox())!;
      return (
        control.x >= sides.name[1] - 0.5 &&
        control.x + control.width <= sides.end[0] + 0.5
      );
    })
    .toBe(true);
});

/**
 * Help beside the page takes Reorder's room at 1366 × 768 (R9, R17): the
 * table scrolls sideways in a named box, its header going with the page,
 * the tick box and the name pinned, and its Actions pinned too only while
 * the two sides take no more than half the box (guard 1), read from the
 * widths the browser lays out. Closed, the table fits again and its
 * header can stay.
 */
test('6 · Help opened beside Reorder at 1366 × 768: it scrolls sideways, the tick box and name pinned, Actions as guard 1 says; closed, it fits again (R9, R17, E12a)', async ({
  page,
  freshOrg,
}) => {
  await reorderScene(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/inventory?tab=reorder');
  const table = listTable(page, 'Reorder');
  await expect(itemLinks(table)).toHaveCount(4);
  const box = boxOf(table);
  // A column neither pinned: it stays under the bar only with the header.
  const stands = table.getByRole('columnheader', { name: 'Where it stands' });
  await expect(box).toHaveAttribute('data-fits', 'true');
  await expect(stands).toHaveCSS('position', 'sticky');

  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Help', exact: true })
    .click();
  const region = page.getByRole('region', {
    name: 'Reorder, scrolls sideways',
  });
  await expect(region).toHaveAttribute('tabindex', '0');
  await expect(box).not.toHaveAttribute('data-fits');
  // Its header goes with the page; the tick box and the name pinned.
  await expect(stands).toHaveCSS('position', 'static');
  await expect(
    table.getByRole('columnheader', { name: 'Item', exact: true }),
  ).toHaveCSS('position', 'sticky');
  await expect(
    table
      .getByRole('checkbox', { name: 'Choose every item to order' })
      .locator('xpath=ancestor::th'),
  ).toHaveCSS('position', 'sticky');

  const sides = await sidesOf(table);
  const pinned = sides.start + sides.actions <= sides.half;
  expect(sides.endPinned).toBe(pinned);
  if (pinned) {
    await expect(region).toHaveAttribute('data-end', 'true');
  } else {
    await expect(region).not.toHaveAttribute('data-end');
  }

  await page.getByRole('button', { name: 'Close help', exact: true }).click();
  await expect(box).toHaveAttribute('data-fits', 'true');
  await expect(
    page.getByRole('region', { name: /scrolls sideways/ }),
  ).toHaveCount(0);
  await expect(stands).toHaveCSS('position', 'sticky');
});
