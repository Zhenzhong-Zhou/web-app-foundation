import type { APIRequestContext, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createPartner,
  createProduct,
  daysFromNow,
  inviteByLink,
  joinByLink,
  registerOrganization,
  signInAs,
  uniqueEmail,
} from './support/api';
import { verifyEmail } from './support/mail';

/**
 * Job roles on screen (ADR-080): an Owner makes one from a template and
 * gives it, and its holder meets it on Home; and each template's holder
 * opens every page in the menu without being refused, since each screen
 * asks only for what its reader may read. The server's rules are
 * roles.e2e-spec.ts's.
 */

interface Template {
  key: string;
  name: string;
  permissions: string[];
}

/** A role made from a template, held by a member who joined with it. */
async function holderOf(
  owner: APIRequestContext,
  template: Template,
  name: string,
): Promise<APIRequestContext> {
  const role = await created<{ id: string }>(
    await owner.post('/v1/roles', {
      data: {
        name: `${template.name} ${Math.random().toString(36).slice(2, 6)}`,
        permissions: template.permissions,
      },
    }),
  );
  const { link } = await created<{ link: string }>(
    await owner.post('/v1/invitations', {
      data: {
        email: uniqueEmail(template.key.replace('_', '-')),
        roleIds: [role.id],
        delivery: 'link',
      },
    }),
  );
  return joinByLink(new URL(link).searchParams.get('token')!, name);
}

async function templates(owner: APIRequestContext): Promise<Template[]> {
  const response = await owner.get('/v1/roles/catalogue');
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { templates: Template[] }).templates;
}

test('an Owner makes a role from a template, gives it, and its holder meets it on Home', async ({
  browser,
  page,
}) => {
  const org = await registerOrganization('roles');
  await verifyEmail(org.api, org.email);
  // Out of the way, so the holder's first week is their own work.
  const dismissed = await org.api.post('/v1/home/getting-started/dismiss');
  expect(dismissed.ok(), await dismissed.text()).toBeTruthy();
  const { token } = await inviteByLink(org.api, uniqueEmail('dock'));
  const member = await joinByLink(token, 'Wang Fang');
  await signInAs(page, org.api);

  await page.goto('/settings/roles');
  await page.getByRole('link', { name: 'Make a role', exact: true }).click();
  await page.getByRole('radio', { name: /^Warehouse/ }).check();
  const name = page.getByRole('textbox', { name: 'Name' });
  await expect(name).toHaveValue('Warehouse');
  await name.fill('Dock crew');
  const summary = page.getByRole('complementary', {
    name: 'What Dock crew can do',
  });
  await expect(summary.getByText(/receive what was ordered/)).toBeVisible();
  await page.getByRole('button', { name: 'Save role', exact: true }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Dock crew', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Nobody holds Dock crew.')).toBeVisible();

  // Given on Members, in place of Viewer.
  await page.goto('/members');
  await page
    .getByRole('button', { name: 'More for Wang Fang', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Change roles', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Change Wang Fang’s roles' });
  await dialog.getByRole('checkbox', { name: /^Dock crew/ }).check();
  await dialog.getByRole('checkbox', { name: /^Viewer/ }).uncheck();
  await expect(dialog.getByText(/receive what was ordered/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Save roles', exact: true }).click();
  await expect(dialog).toBeHidden();

  await page.goto('/settings/roles');
  await page.getByRole('link', { name: 'Dock crew', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Wang Fang', exact: true }),
  ).toBeVisible();

  // The holder's own browser: Home says what Dock crew lets them do, and
  // the first week offers receiving.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const holder = await context.newPage();
  await signInAs(holder, member);
  await holder.goto('/');
  const card = holder.getByRole('region', {
    name: `Welcome to ${org.organizationName}, Wang Fang`,
    exact: true,
  });
  await expect(
    card.getByText(/^You joined today as Dock crew\./),
  ).toBeVisible();
  await expect(card.getByText(/receive what was ordered/)).toBeVisible();
  await expect(
    card.getByRole('link', { name: 'Receive stock', exact: true }),
  ).toBeVisible();
  // The menu, by what Dock crew grants.
  const main = holder.getByRole('navigation', { name: 'Main' });
  await expect(
    main.getByRole('link', { name: 'Orders', exact: true }),
  ).toBeVisible();
  await expect(
    holder.getByRole('link', { name: 'Stock value', exact: true }),
  ).toHaveCount(0);

  await context.close();
  await member.dispose();
  await org.api.dispose();
});

/**
 * Enough for the pages to read what they read when in use: a lot in
 * stock, a partner, and a confirmed purchase with a priced line.
 */
async function seed(owner: APIRequestContext): Promise<{ orderId: string }> {
  const product = await createProduct(owner, { tracksLots: true });
  const location = await createLocation(owner);
  const partner = await createPartner(owner);
  await created(
    await owner.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '24',
        reason: 'receipt',
        lot: { code: 'ROLES-LOT-1', expiresAt: daysFromNow(200) },
      },
    }),
  );
  const { order } = await created<{ order: { id: string } }>(
    await owner.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'purchase',
        lines: [
          {
            variantId: product.variantId,
            quantityOrdered: '40',
            unitPrice: '12.50',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  const confirmed = await owner.patch(`/v1/orders/${order.id}`, {
    data: { status: 'confirmed' },
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  return { orderId: order.id };
}

/** Every page the menu offers its reader, by its address. */
async function menu(page: Page): Promise<string[]> {
  const links = page
    .getByRole('navigation', { name: /^(Main|Records|Settings)$/ })
    .getByRole('link');
  await expect(links.first()).toBeVisible();
  return [
    ...new Set(
      await links.evaluateAll((each) =>
        each.map((link) => link.getAttribute('href') ?? ''),
      ),
    ),
  ];
}

const TEMPLATES = [
  'warehouse',
  'sales',
  'finance',
  'production',
  'stock_lookup',
] as const;

for (const key of TEMPLATES) {
  test(`a ${key} holder opens every page in the menu without a refusal`, async ({
    page,
  }) => {
    // Twenty pages, each read to the end.
    test.setTimeout(180_000);
    const org = await registerOrganization('menu');
    await verifyEmail(org.api, org.email);
    const { orderId } = await seed(org.api);
    const template = (await templates(org.api)).find(
      (each) => each.key === key,
    )!;
    const holder = await holderOf(org.api, template, 'Template Holder');
    await signInAs(page, holder);

    // Any request a screen makes that its reader's roles refuse.
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 403 && response.url().includes('/api/v1/')) {
        refused.push(`${page.url()} → ${new URL(response.url()).pathname}`);
      }
    });

    await page.goto('/');
    const pages = await menu(page);
    // The order page too, where Orders is offered: it read the sites,
    // which not every role may (ADR-080).
    if (pages.includes('/orders')) pages.push(`/orders/${orderId}`);

    for (const path of pages) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expect(
        page.getByRole('heading', { name: "You don't have access to this" }),
      ).toHaveCount(0);
    }

    expect(refused).toEqual([]);
    await holder.dispose();
    await org.api.dispose();
  });
}
