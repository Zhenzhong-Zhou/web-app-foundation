import { expect, test } from './fixtures';
import {
  inviteByLink,
  joinByLink,
  registerOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { verifyEmail } from './support/mail';

/**
 * Home for an account with no organization (ADR-078): what it can do,
 * never the cards' refusal; and, where registration is open, as the e2e
 * stack runs, Start an organization, which makes the account its Owner.
 */

/** An account that left the organization it joined, so belongs to none. */
async function inNoOrganization(email: string) {
  const first = await registerOrganization('inviter');
  await verifyEmail(first.api, first.email);
  const member = await joinByLink((await inviteByLink(first.api, email)).token);
  const left = await member.delete('/v1/account/membership');
  expect(left.ok(), await left.text()).toBeTruthy();
  return member;
}

test('an account with no organization starts one from Home, as its Owner', async ({
  page,
}) => {
  const member = await inNoOrganization(uniqueEmail('starter'));
  await signInAs(page, member);

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Join an organization', exact: true }),
  ).toBeVisible();
  // Not exact: absent in any wording around it.
  await expect(
    page.getByText('You do not belong to any organization'),
  ).toHaveCount(0);

  await page
    .getByRole('textbox', { name: 'Organization name', exact: true })
    .fill('Reid Supply Co.');
  await page
    .getByRole('button', { name: 'Start an organization', exact: true })
    .click();

  // Its own Home now, a new organization's: Getting started.
  await expect(
    page.getByText(/Seven steps get your organization ready to work/),
  ).toBeVisible();
});
