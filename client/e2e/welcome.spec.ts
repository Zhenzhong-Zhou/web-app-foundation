import { expect, test } from './fixtures';
import {
  E2E_PASSWORD,
  inviteByLink,
  joinByLink,
  registerOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { confirmEmailInDatabase } from './support/mail';

/**
 * A newcomer's first sign-in (ADR-079), as they and their inviter meet it:
 * the welcome on Home with the note, Dismiss and Undo, and the inviter's
 * bell saying they joined. The server's rules are welcome.e2e-spec.ts's.
 */
test('a newcomer accepts with a note, meets their welcome, and the inviter hears', async ({
  browser,
  page,
}) => {
  const org = await registerOrganization('welcome');
  await confirmEmailInDatabase(org.email);
  // Out of the way, so the first week is the Viewer's own work rather
  // than the organization's steps.
  const dismissed = await org.api.post('/v1/home/getting-started/dismiss');
  expect(dismissed.ok(), await dismissed.text()).toBeTruthy();

  // A copied link rather than the email, so setup waits on no mail
  // (#248); the emailed link's own test is invitation.spec.ts's.
  const email = uniqueEmail('wang');
  const { token } = await inviteByLink(org.api, email, 'Viewer', {
    note: 'On Monday you’ll shadow Li Na.\nLook up each lot as it comes in.',
  });

  // The newcomer's own browser, with no session.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const newcomer = await context.newPage();
  await newcomer.goto(`/invitation?token=${token}`);
  await newcomer.getByLabel('Your name').fill('Wang Fang');
  await newcomer.getByLabel(/^Choose a password/).fill(E2E_PASSWORD);
  await newcomer
    .getByRole('button', { name: `Join ${org.organizationName}`, exact: true })
    .click();
  await newcomer.waitForURL('/');

  const card = newcomer.getByRole('region', {
    name: `Welcome to ${org.organizationName}, Wang Fang`,
    exact: true,
  });
  await expect(card).toBeVisible();
  await expect(card.getByText(/^You joined today as a Viewer\./)).toBeVisible();
  const note = card.getByRole('figure');
  await expect(
    note.getByRole('link', { name: 'E2E Owner', exact: true }),
  ).toBeVisible();
  await expect(note.getByText(/On Monday you’ll shadow Li Na\./)).toBeVisible();
  await expect(
    card.getByRole('heading', { name: 'What you can do here', exact: true }),
  ).toBeVisible();
  // A copied link confirms nothing, so the week starts with confirming
  // the address. An emailed link's newcomer, confirmed as they join,
  // starts at Say who you are (welcome.e2e-spec.ts).
  await expect(card.getByText('Your first week · 0 of 4 done')).toBeVisible();
  await expect(
    card.getByText('Confirm your email address', { exact: true }),
  ).toBeVisible();

  await card
    .getByRole('button', { name: 'Dismiss the welcome card', exact: true })
    .click();
  await expect(card).toBeHidden();
  const hidden = newcomer
    .getByRole('status')
    .filter({ hasText: 'Welcome card hidden.' });
  await expect(hidden).toHaveText(
    /What you can do here stays on Your account\./,
  );
  // From the heading Dismiss put focus on, the next Tab is Undo, which
  // stays as long as it has focus, past its eight seconds (WCAG 2.2.1).
  const undo = hidden.getByRole('button', { name: 'Undo', exact: true });
  await newcomer.keyboard.press('Tab');
  await expect(undo).toBeFocused();
  await newcomer.waitForTimeout(9_000);
  await expect(undo).toBeVisible();
  await newcomer.keyboard.press('Enter');
  await expect(card).toBeVisible();
  // Undone on the server too, not only on this page.
  await newcomer.reload();
  await expect(card).toBeVisible();
  await context.close();

  // The inviter's bell, once the acceptance has told it.
  await expect
    .poll(async () => {
      const { entries } = (await (
        await org.api.get('/v1/notifications')
      ).json()) as { entries: { type: string }[] };
      return entries.some((entry) => entry.type === 'invitation.accepted');
    })
    .toBe(true);
  await signInAs(page, org.api);
  await page.goto('/');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  const joined = page.getByRole('menuitem', { name: /Wang Fang joined/ });
  await expect(joined).toContainText(
    `Wang Fang accepted your invitation and joined ${org.organizationName} as a Viewer.`,
  );
  await joined.click();

  // Their page on People, to greet them.
  await expect(page).toHaveURL(/\/people\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Wang Fang');
});

/**
 * The welcome at a phone's width and a tablet's held sideways (ADR-091):
 * folded to one line above the tiles below `md`, opening in place; open
 * from `md`, with Fold. Open, each first-week item and each area under
 * What you can do here is a link.
 */
for (const size of [
  { width: 390, height: 844 },
  { width: 1180, height: 820 },
]) {
  test(`the welcome at ${size.width} px: ${size.width < 900 ? 'folded, opened in place' : 'open, with Fold'}`, async ({
    page,
  }) => {
    const org = await registerOrganization('welcome-fold');
    await confirmEmailInDatabase(org.email);
    const dismissed = await org.api.post('/v1/home/getting-started/dismiss');
    expect(dismissed.ok(), await dismissed.text()).toBeTruthy();
    const { token } = await inviteByLink(
      org.api,
      uniqueEmail('fatima'),
      'Viewer',
      { note: 'Start with the orders to ship.' },
    );
    const newcomer = await joinByLink(token, 'Fatima Haddad');

    await page.setViewportSize(size);
    await signInAs(page, newcomer);
    await page.goto('/');

    const card = page.getByRole('region', {
      name: `Welcome to ${org.organizationName}, Fatima Haddad`,
      exact: true,
    });
    await expect(
      card.getByText(/^Your first week · \d of \d done$/),
    ).toBeVisible();
    // Above the tiles, in either state.
    const tiles = page.getByRole('heading', { name: 'What needs you today' });
    expect((await card.boundingBox())!.y).toBeLessThan(
      (await tiles.boundingBox())!.y,
    );

    if (size.width < 900) {
      const open = card.getByRole('button', { name: 'Open', exact: true });
      await expect(open).toHaveAttribute('aria-expanded', 'false');
      // Its head alone: neither the note nor the first week.
      await expect(card.getByRole('figure')).toBeHidden();
      await expect(
        card.getByRole('list', { name: 'Your first week' }),
      ).toBeHidden();
      await open.click();
    }

    const fold = card.getByRole('button', { name: 'Fold', exact: true });
    await expect(fold).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByRole('figure')).toContainText(
      'Start with the orders to ship.',
    );
    const lookUp = card.getByRole('link', {
      name: /^Look up an item or a lot/,
    });
    await expect(lookUp).toHaveAttribute('href', '/items');
    expect((await lookUp.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(
      card.getByRole('link', { name: 'Items', exact: true }),
    ).toHaveAttribute('href', '/items');

    await fold.click();
    await expect(card.getByRole('figure')).toBeHidden();
  });
}
