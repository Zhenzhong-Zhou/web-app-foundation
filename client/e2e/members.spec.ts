import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  inviteByLink,
  joinByLink,
  roleIdNamed,
  type SeededOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { latestEmailTo, verifyEmail } from './support/mail';

/**
 * Invite (ADR-077), as an Owner and an Admin meet it. The server's rules
 * are proved in invitations.e2e-spec.ts; what only a browser shows is each
 * state of the dialog, each refusal where it applies, and Invited.
 */
test.describe('invitations', () => {
  /** A fresh organization whose Owner is verified, as inviting needs. */
  async function verified(freshOrg: SeededOrganization) {
    await verifyEmail(freshOrg.api, freshOrg.email);
    return freshOrg;
  }

  function inviteDialog(page: Page, organizationName: string) {
    return page.getByRole('dialog', {
      name: `Invite someone to ${organizationName}`,
    });
  }

  test('invites by email: Invited says emailed until its last day, and the email goes', async ({
    page,
    freshOrg,
  }) => {
    const org = await verified(freshOrg);
    const email = uniqueEmail('invitee');
    await signInAs(page, org.api);
    await page.goto('/members');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    const dialog = inviteDialog(page, org.organizationName);
    // The least access to start with, raised on purpose.
    await expect(dialog.getByRole('radio', { name: /^Viewer/ })).toBeChecked();
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('radio', { name: /^Admin/ }).check();
    await dialog.getByLabel('A note from you (optional)').fill('Bring boots');
    await expect(dialog.getByText('11 / 500')).toBeVisible();
    await dialog.getByRole('button', { name: 'Send invitation' }).click();

    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
    const row = page
      .getByRole('table', { name: 'Invited' })
      .getByRole('row', { name: new RegExp(email) });
    await expect(row).toContainText('Admin');
    await expect(row).toContainText(/Emailed · until (\d+ \w+|\w+ \d+)/);
    await expect(row).toContainText('Invited by you, today');

    const mail = await latestEmailTo(email);
    expect(mail.subject).toBe(
      `E2E Owner invited you to join ${org.organizationName}`,
    );
    expect(mail.text).toContain('Bring boots');
  });

  test('opens from Getting started by the address, which closing takes off', async ({
    page,
    freshOrg,
  }) => {
    await signInAs(page, freshOrg.api);
    await page.goto('/');
    await page.getByRole('link', { name: 'Invite someone' }).click();

    await expect(page).toHaveURL(/\/members\?invite$/);
    const dialog = inviteDialog(page, freshOrg.organizationName);
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    // Off the address, so a reload or Back does not open it again.
    await expect(page).toHaveURL(/\/members$/);
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test('copies a link instead, sending nothing, and says it works once', async ({
    page,
    context,
    freshOrg,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const org = await verified(freshOrg);
    const email = uniqueEmail('copied');
    await signInAs(page, org.api);
    await page.goto('/members');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    const dialog = inviteDialog(page, org.organizationName);
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('button', { name: 'Copy link' }).click();

    const copied = page.getByRole('dialog', { name: 'Link copied' });
    await expect(copied.getByRole('status')).toHaveText(
      'Copied. Paste it into a message to the person you’re inviting.',
    );
    const link = await copied.getByLabel('Invitation link').inputValue();
    expect(link).toMatch(/\/invitation\?token=[\w-]{43}$/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      link,
    );
    await expect(copied).toContainText(
      `whoever opens it first joins as ${email}, a Viewer.`,
    );
    await expect(copied).toContainText('No email was sent.');
    await copied.getByRole('button', { name: 'Done' }).click();

    await expect(
      page
        .getByRole('table', { name: 'Invited' })
        .getByRole('row', { name: new RegExp(email) }),
    ).toContainText(/Link copied · until/);
  });

  test('resends, copies and revokes from a row, each named for its person', async ({
    page,
    context,
    freshOrg,
  }) => {
    // Copied, so the dialog says so: without the clipboard it says to copy
    // the field instead (invite-dialog.test.tsx).
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const org = await verified(freshOrg);
    const email = uniqueEmail('row');
    await created(
      await org.api.post('/v1/invitations', {
        data: { email, roleId: await roleIdNamed(org.api, 'Viewer') },
      }),
    );
    await signInAs(page, org.api);
    await page.goto('/members');

    await page.getByRole('button', { name: `Resend to ${email}` }).click();
    await expect(
      page.getByText(`Invitation sent again to ${email}`),
    ).toBeVisible();

    await page.getByRole('button', { name: `Copy link for ${email}` }).click();
    const copied = page.getByRole('dialog', { name: 'Link copied' });
    // The emailed link is spent now, and it says so.
    await expect(copied).toContainText(
      'The link in the email no longer works.',
    );
    await copied.getByRole('button', { name: 'Done' }).click();

    await page
      .getByRole('button', { name: `Revoke the invitation for ${email}` })
      .click();
    const confirm = page.getByRole('dialog', {
      name: `Revoke the invitation for ${email}?`,
    });
    await expect(confirm).toContainText('Its link stops working.');
    await confirm.getByRole('button', { name: 'Revoke' }).click();

    await expect(
      page.getByText(`Invitation for ${email} revoked`),
    ).toBeVisible();
    // None left, so no Invited heading at all.
    await expect(page.getByRole('heading', { name: /^Invited/ })).toBeHidden();
  });

  test('says where an address is refused: a member already, or invited with Resend instead', async ({
    page,
    freshOrg,
  }) => {
    const org = await verified(freshOrg);
    const invited = uniqueEmail('again');
    await created(
      await org.api.post('/v1/invitations', {
        data: { email: invited, roleId: await roleIdNamed(org.api, 'Viewer') },
      }),
    );
    await signInAs(page, org.api);
    await page.goto('/members');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    const dialog = inviteDialog(page, org.organizationName);
    await dialog.getByLabel('Email').fill(org.email);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByLabel('Email')).toHaveAccessibleDescription(
      'E2E Owner is already a member here, as an Owner.',
    );

    await dialog.getByLabel('Email').fill(invited);
    await dialog.getByRole('button', { name: 'Send invitation' }).click();
    await expect(dialog.getByLabel('Email')).toHaveAccessibleDescription(
      /^Invited today by you\. Its link works until (\d+ \w+|\w+ \d+)\.$/,
    );
    await dialog.getByRole('button', { name: 'Resend instead' }).click();
    await expect(
      page.getByText(`Invitation sent again to ${invited}`),
    ).toBeVisible();
  });

  test('asks an inviter whose own email is unconfirmed to confirm it, with the way to', async ({
    page,
    freshOrg,
  }) => {
    await signInAs(page, freshOrg.api);
    await page.goto('/members');

    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    const dialog = inviteDialog(page, freshOrg.organizationName);
    await dialog.getByLabel('Email').fill(uniqueEmail('early'));
    await dialog.getByRole('button', { name: 'Send invitation' }).click();

    await expect(dialog.getByRole('alert')).toContainText(
      `Confirm your own email first. Invitations go out in your name, so we need to know ${freshOrg.email} is yours.`,
    );
    await dialog.getByRole('button', { name: 'Resend confirmation' }).click();
    await expect(
      page.getByText(`Confirmation sent to ${freshOrg.email}`),
    ).toBeVisible();
  });

  test('shows an Admin the Owner card disabled with its reason, and no buttons on an Owner’s invitation', async ({
    page,
    freshOrg,
  }) => {
    const org = await verified(freshOrg);
    const owner = uniqueEmail('owner-invite');
    const viewer = uniqueEmail('viewer-invite');
    await inviteByLink(org.api, owner, 'Owner');
    await inviteByLink(org.api, viewer, 'Viewer');
    const admin = await joinByLink(
      (await inviteByLink(org.api, uniqueEmail('admin'), 'Admin')).token,
    );

    await signInAs(page, admin);
    await page.goto('/members');

    const invited = page.getByRole('table', { name: 'Invited' });
    await expect(
      invited.getByRole('button', { name: `Resend to ${viewer}` }),
    ).toBeVisible();
    for (const name of [
      `Resend to ${owner}`,
      `Copy link for ${owner}`,
      `Revoke the invitation for ${owner}`,
    ]) {
      await expect(invited.getByRole('button', { name })).toHaveCount(0);
    }

    await page.getByRole('button', { name: 'Invite', exact: true }).click();
    const ownerCard = inviteDialog(page, org.organizationName).getByRole(
      'radio',
      { name: /^Owner/ },
    );
    await expect(ownerCard).toBeDisabled();
    await expect(ownerCard).toHaveAccessibleDescription(
      'Only an Owner can invite an Owner.',
    );
  });
});
