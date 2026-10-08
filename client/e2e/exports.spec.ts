import { readFile } from 'node:fs/promises';

import { expect, test } from './fixtures';
import { signInAs } from './support/api';

/**
 * Exports (ADR-057), end to end: a list narrowed to a period, exported, and
 * the file the browser saves is the server's CSV, named for the list and
 * the day. Its own organization, so it can run beside the rest.
 */
test('exports this month’s orders as a CSV the browser saves', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);
  await page.goto('/orders');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Period' }).click();
  await page.getByRole('menuitem', { name: 'This month' }).click();
  await expect(page.getByLabel('Expected from')).not.toHaveValue('');

  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await saved;

  expect(download.suggestedFilename()).toMatch(
    /^orders-\d{4}-\d{2}-\d{2}\.csv$/,
  );
  const text = await readFile(await download.path(), 'utf8');
  // The byte-order mark for Excel, then the headers in English.
  expect(text.startsWith('\uFEFFReference,Direction,Status,Partner')).toBe(
    true,
  );
});
