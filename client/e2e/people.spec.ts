import { expect, test } from './fixtures';
import { signInAs } from './support/api';

/** A 4 × 4 PNG: enough for the server to crop and size. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEUlEQVR4nGM4saACjhiI4wAAEWEeASCPU3oAAAAASUVORK5CYII=',
  'base64',
);

/**
 * People (ADR-063): your details at work and your photo, set on your
 * Account page, are what colleagues find on People and a person's page.
 */
test('sets details and a photo, and finds them on People', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/account');

  await page.getByLabel('Job title').fill('Operations manager');
  await page.getByLabel('Extension').fill('214');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'me.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  // The face in the top bar becomes the photo.
  await expect(
    page.getByRole('button', { name: /^Signed in as/ }).locator('img'),
  ).toBeVisible();

  await page.goto('/people');
  await expect(page.getByText('Operations manager')).toBeVisible();
  await page.getByRole('link', { name: freshOrg.name }).click();

  await expect(page.getByRole('heading', { name: freshOrg.name })).toBeVisible();
  await expect(page.getByText('ext. 214')).toBeVisible();
  // Your own page lists no work: that is on your Account page.
  await expect(page.getByText('Recent activity')).toHaveCount(0);
});
