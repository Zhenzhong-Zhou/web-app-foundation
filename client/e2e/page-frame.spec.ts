import { expect, test } from './fixtures';
import {
  inviteByLink,
  joinByLink,
  registerOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { everyPage } from './support/every-page';
import { confirmEmailInDatabase } from './support/mail';

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
