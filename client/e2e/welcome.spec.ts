import { expect, test } from './fixtures';
import {
  created,
  E2E_PASSWORD,
  registerOrganization,
  roleIdNamed,
  signInAs,
  uniqueEmail,
} from './support/api';
import { latestEmailTo, tokenIn, verifyEmail } from './support/mail';

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
  await verifyEmail(org.api, org.email);
  // Out of the way, so the first week is the Viewer's own work rather
  // than the organization's steps.
  const dismissed = await org.api.post('/v1/home/getting-started/dismiss');
  expect(dismissed.ok(), await dismissed.text()).toBeTruthy();

  const email = uniqueEmail('wang');
  await created(
    await org.api.post('/v1/invitations', {
      data: {
        email,
        roleId: await roleIdNamed(org.api, 'Viewer'),
        note: 'On Monday you’ll shadow Li Na.\nLook up each lot as it comes in.',
      },
    }),
  );
  const token = tokenIn(await latestEmailTo(email), '/invitation');

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
  // The emailed link confirmed the address, so the week starts with Say
  // who you are, and the banner is nowhere.
  await expect(card.getByText('0 of 3 done')).toBeVisible();
  await expect(card.getByText('Confirm your email address')).toHaveCount(0);

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
  await hidden.getByRole('button', { name: 'Undo', exact: true }).click();
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
