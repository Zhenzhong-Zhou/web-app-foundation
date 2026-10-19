import type { Browser, BrowserContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  E2E_PASSWORD,
  inviteByLink,
  joinByLink,
  registerOrganization,
  roleIdNamed,
  type SeededOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { latestEmailTo, tokenIn, verifyEmail } from './support/mail';

/**
 * The invitation page (ADR-077), as the invited person meets it: from the
 * email's link or a copied one, signed out or signed in. The server's rules
 * are invitations.e2e-spec.ts's; this is what the page makes of them.
 */

/** An organization whose Owner is verified, as inviting needs. */
async function inviter(): Promise<SeededOrganization> {
  const organization = await registerOrganization('inviter');
  await verifyEmail(organization.api, organization.email);
  return organization;
}

/** The signed-out browsers a test opened, closed after it. */
const opened: BrowserContext[] = [];

test.afterEach(async () => {
  await Promise.all(opened.splice(0).map((context) => context.close()));
});

/** A page with no session, the newcomer's own browser. */
async function signedOut(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  opened.push(context);
  return context.newPage();
}

/** An account that left the organization it joined, so belongs to none. */
async function inNoOrganization(email: string) {
  const first = await inviter();
  const member = await joinByLink((await inviteByLink(first.api, email)).token);
  const left = await member.delete('/v1/account/membership');
  expect(left.ok(), await left.text()).toBeTruthy();
  return member;
}

const open = (page: Page, token: string) =>
  page.goto(`/invitation?token=${token}`);

test('a new person joins from the emailed link, in the language it was written in', async ({
  browser,
}) => {
  const org = await inviter();
  const email = uniqueEmail('newcomer');
  await created(
    await org.api.post('/v1/invitations', {
      data: {
        email,
        roleId: await roleIdNamed(org.api, 'Admin'),
        locale: 'zh-Hans',
        note: '周一早上 8 点到北区仓库收货。',
      },
    }),
  );
  const token = tokenIn(await latestEmailTo(email), '/invitation');

  const page = await signedOut(browser);
  await open(page, token);

  // In the invitation's language, from the read (ADR-077).
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: `加入 ${org.organizationName}`,
    }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', /^zh/);
  // Named by name and by address, as the email names them.
  await expect(
    page.getByText(`E2E Owner（${org.email}）邀请您以管理员身份加入。`),
  ).toBeVisible();
  await expect(page.getByText('周一早上 8 点到北区仓库收货。')).toBeVisible();
  await expect(page.getByLabel('电子邮箱')).toHaveValue(email);
  await expect(page.getByLabel('电子邮箱')).toHaveAttribute('readonly', '');

  await page.getByLabel('您的姓名').fill('王芳');
  await page.getByLabel(/^设置密码/).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: '显示密码' }).click();
  await expect(page.getByLabel(/^设置密码/)).toHaveAttribute('type', 'text');
  await page
    .getByRole('button', { name: `加入 ${org.organizationName}` })
    .click();

  await page.waitForURL('/');
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    user: { name: string; locale: string };
    organization: { name: string } | null;
  };
  expect(me.organization?.name).toBe(org.organizationName);
  // The account takes the language the page was in.
  expect(me.user).toMatchObject({ name: '王芳', locale: 'zh-Hans' });
});

test('an account in no organization signs in through sign-in, then joins', async ({
  browser,
}) => {
  const org = await inviter();
  const email = uniqueEmail('returning');
  await inNoOrganization(email);
  const { token } = await inviteByLink(org.api, email);

  const page = await signedOut(browser);
  await open(page, token);
  await expect(page.getByRole('status')).toHaveText(
    'You already have an account with this address. Sign in with your password to join.',
  );
  await expect(page.getByLabel('Email')).toHaveValue(email);
  await expect(
    page.getByRole('link', { name: 'Forgot your password?' }),
  ).toBeVisible();
  await page.getByLabel(/^Password/).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Sign in and join' }).click();

  await page.waitForURL('/');
  const me = (await (await page.request.get('/api/v1/auth/me')).json()) as {
    organization: { name: string } | null;
  };
  expect(me.organization?.name).toBe(org.organizationName);
});

test('a link used, revoked or never sent reads as ended, all alike', async ({
  browser,
}) => {
  const org = await inviter();
  const used = await inviteByLink(org.api, uniqueEmail('used'));
  await (await joinByLink(used.token)).dispose();
  const revoked = await inviteByLink(org.api, uniqueEmail('revoked'));
  expect((await org.api.delete(`/v1/invitations/${revoked.id}`)).ok()).toBe(
    true,
  );

  const page = await signedOut(browser);
  for (const token of [
    used.token,
    revoked.token,
    'a-token-nobody-was-ever-sent-00000000',
  ]) {
    await open(page, token);
    await expect(
      page.getByRole('heading', { name: 'This invitation has ended' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Go to sign in' }),
    ).toBeVisible();
  }
});

test('signed in as another address, it offers Sign out, and then the invitation', async ({
  page,
}) => {
  const org = await inviter();
  const email = uniqueEmail('elsewhere');
  const { token } = await inviteByLink(org.api, email);
  const someoneElse = await registerOrganization('someone');
  await signInAs(page, someoneElse.api);

  await open(page, token);
  await expect(
    page.getByRole('heading', { name: `This invitation is for ${email}` }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `You’re signed in as ${someoneElse.email}. Sign out, then open the link again.`,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page.getByLabel('Your name')).toBeVisible();
});

test('signed in to another organization, it says why, to that account alone', async ({
  page,
}) => {
  const org = await inviter();
  const other = await registerOrganization('busy');
  const { token } = await inviteByLink(org.api, other.email);
  await signInAs(page, other.api);

  await open(page, token);
  await expect(
    page.getByRole('heading', { name: 'You can’t join with this account yet' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      `${other.email} already belongs to another organization, and for now an account can belong to only one.`,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Go to your account' }),
  ).toBeVisible();
});

test('an account set to be deleted keeps it here first, then joins as itself', async ({
  page,
}) => {
  const org = await inviter();
  const email = uniqueEmail('leaving');
  const member = await inNoOrganization(email);
  const scheduled = await member.post('/v1/account/deletion', {
    data: { password: E2E_PASSWORD },
  });
  expect(scheduled.ok(), await scheduled.text()).toBeTruthy();
  const { token } = await inviteByLink(org.api, email);
  await signInAs(page, member);

  await open(page, token);
  await expect(
    page.getByRole('heading', { name: 'Keep your account to join' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Keep my account' }).click();

  // Kept: Join, for the account signed in, with the way out if it is not.
  await expect(page.getByText(`You’re signed in as ${email}.`)).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Not you? Sign out' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: `Join ${org.organizationName}` })
    .click();
  await page.waitForURL('/');
});

test('an organization being closed takes nobody, and says so at once', async ({
  browser,
}) => {
  const org = await inviter();
  const { token } = await inviteByLink(org.api, uniqueEmail('late'));
  const closing = await org.api.post('/v1/organization/deletion', {
    data: {
      organizationName: org.organizationName,
      password: E2E_PASSWORD,
      declineExport: true,
    },
  });
  expect(closing.ok(), await closing.text()).toBeTruthy();

  const page = await signedOut(browser);
  await open(page, token);
  await expect(
    page.getByRole('heading', {
      name: `${org.organizationName} isn’t taking new members`,
    }),
  ).toBeVisible();
  await expect(page.getByText(/will be deleted after/)).toBeVisible();
  await expect(page.getByLabel('Your name')).toHaveCount(0);
});

test('its logo comes in the read, never from the file route', async ({
  browser,
}) => {
  const org = await inviter();
  const logo = (
    await created<{ file: { id: string } }>(
      await org.api.post('/v1/files/logo', {
        multipart: {
          file: {
            name: 'logo.svg',
            mimeType: 'image/svg+xml',
            buffer: Buffer.from(
              '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="100"><rect width="300" height="100" fill="#2a6"/></svg>',
            ),
          },
        },
      }),
    )
  ).file.id;
  const attached = await org.api.patch('/v1/organization', {
    data: { logoFileId: logo },
  });
  expect(attached.ok(), await attached.text()).toBeTruthy();
  const { token } = await inviteByLink(org.api, uniqueEmail('logo'));

  const page = await signedOut(browser);
  const files: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/files')) files.push(request.url());
  });
  await open(page, token);

  const image = page.locator('img[src^="data:image/png;base64,"]');
  await expect(image).toBeVisible();
  expect(files).toEqual([]);
});
