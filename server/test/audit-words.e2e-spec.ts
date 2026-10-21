import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { deletionDayFor } from '../src/core/auth/account-deletion.service';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, roles, users } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createVariant,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

interface Value {
  text: string;
  link?: { kind: string; id: string } | null;
}

interface Entry {
  action: string;
  actionName: string;
  resourceTypeName: string | null;
  details: {
    field: string;
    changed: boolean;
    from: Value | null;
    value: Value | null;
  }[];
}

/**
 * The audit log in words (ADR-076): each entry named and its details
 * worded in the reader's language, no id where a person reads, and the
 * CSV saying what the screens say.
 */
describe('The audit log in words (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get(UNSAFE_GLOBAL_DB);
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  /** Sarah joins as a Viewer and is made an Admin. */
  async function promoted() {
    const alpha = await registerOrganization(app, 'alpha');
    const roleId = async (name: string) => {
      const [role] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, alpha.organizationId),
            eq(roles.name, name),
          ),
        );
      return role.id;
    };
    await addMember(app, alpha, 'sarah@alpha.example.com', 'Viewer');
    const [sarah] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'sarah@alpha.example.com'));
    await alpha.agent
      .patch(`/v1/users/${sarah.id}`)
      .send({ roleIds: [await roleId('Admin')] })
      .expect(204);
    return {
      alpha,
      viewerId: await roleId('Viewer'),
      adminId: await roleId('Admin'),
    };
  }

  async function entries(
    alpha: Awaited<ReturnType<typeof registerOrganization>>,
    language: string,
    query = '',
  ) {
    const res = await alpha.agent
      .get(`/v1/audit${query}`)
      .set('Accept-Language', language)
      .expect(200);
    return body<{ entries: Entry[] }>(res).entries;
  }

  it('words a change of roles in the reader’s language, linked by id', async () => {
    const { alpha, viewerId, adminId } = await promoted();

    const [english] = await entries(
      alpha,
      'en',
      '?action=member.roles_changed',
    );
    expect(english.actionName).toBe('Member’s roles changed');
    expect(english.details).toEqual([
      {
        field: 'Roles',
        changed: true,
        from: { text: 'Viewer', link: { kind: 'role', id: viewerId } },
        value: { text: 'Admin', link: { kind: 'role', id: adminId } },
      },
    ]);

    const [chinese] = await entries(
      alpha,
      'zh-Hans',
      '?action=member.roles_changed',
    );
    expect(chinese.details[0].field).toBe('角色');
    expect(chinese.details[0].from?.text).toBe('查看者');
    expect(chinese.details[0].value?.text).toBe('管理员');
  });

  // ADR-080: a member's one role before several, as its entry was kept.
  it('still words an old change of one role as it did', async () => {
    const { alpha, viewerId, adminId } = await promoted();
    await db.insert(auditLog).values({
      organizationId: alpha.organizationId,
      actorId: alpha.userId,
      action: 'user.role_changed',
      resourceType: 'user',
      resourceId: alpha.userId,
      payload: {
        roleId: {
          from: { id: viewerId, label: 'Viewer' },
          to: { id: adminId, label: 'Admin' },
        },
      },
    });

    const [french] = await entries(alpha, 'fr-CA', '?action=user.role_changed');
    expect(french.actionName).toBe('A changé le rôle d’un membre');
    expect(french.details).toEqual([
      {
        field: 'Rôle',
        changed: true,
        from: { text: 'Lecteur', link: { kind: 'role', id: viewerId } },
        value: { text: 'Administrateur', link: { kind: 'role', id: adminId } },
      },
    ]);
  });

  it('links an invoice draft’s shipment to its order', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { orderId, shipmentId } = await shippedSale(alpha.agent);
    await alpha.agent.post('/v1/invoices').send({ shipmentId }).expect(201);
    const { number } = body<{ number: string }>(
      await alpha.agent.get(`/v1/orders/${orderId}`).expect(200),
    );

    const [drafted] = await entries(alpha, 'en', '?action=invoice.created');
    const shipment = drafted.details.find(
      (detail) => detail.field === 'Shipment',
    );
    // A shipment has no page: its order's, the id only in the link.
    expect(shipment?.value).toEqual({
      text: number,
      link: { kind: 'order', id: orderId },
    });
  });

  it('names the item whose list price was set, as a receipt names its line', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const variantId = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus',
      variant: { sku: 'FOCUS-60CT' },
    });
    const listId = body<{ priceList: { id: string } }>(
      await alpha.agent
        .post('/v1/price-lists')
        .send({ name: 'Wholesale CAD', direction: 'sale', currency: 'CAD' })
        .expect(201),
    ).priceList.id;
    for (const unitPrice of ['24.99', '26.49']) {
      await alpha.agent
        .put(`/v1/price-lists/${listId}/items/${variantId}`)
        .send({ unitPrice })
        .expect(200);
    }

    // The row names the list; the details, which of its items changed.
    const [changed] = await entries(alpha, 'en', '?action=price_list.item_set');
    expect(changed.details.map((detail) => detail.field)).toEqual([
      'Unit price',
      'Item',
    ]);
    expect(changed.details[1].value).toEqual({
      text: 'FOCUS-60CT',
      link: { kind: 'variant', id: variantId },
    });

    await alpha.agent
      .delete(`/v1/price-lists/${listId}/items/${variantId}`)
      .expect(204);
    const [removed] = await entries(
      alpha,
      'en',
      '?action=price_list.item_removed',
    );
    expect(removed.details[0]).toMatchObject({
      field: 'Item',
      value: { text: 'FOCUS-60CT' },
    });
  });

  // Written outside @Audited: a pro forma and the organization's export
  // through record(), a scheduled deletion straight into the table, which
  // the compiler does not see, as it does not see an export's filters.
  it('names every field of the entries written outside @Audited', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { orderId } = await shippedSale(alpha.agent);
    await alpha.agent.get(`/v1/orders/${orderId}/pro-forma`).expect(200);
    await alpha.agent.get('/v1/orders/export?search=SO').expect(200);
    await alpha.agent
      .get('/v1/organization/export')
      .responseType('blob')
      .expect(200);
    await alpha.agent
      .post('/v1/organization/deletion')
      .send({ organizationName: 'alpha Co', password: PASSWORD })
      .expect(200);

    const worded = await entries(alpha, 'en');
    // Each field to its value. A payload is JSONB, which keeps no key order.
    const fieldsOf = (action: string) =>
      Object.fromEntries(
        worded
          .find((entry) => entry.action === action)
          ?.details.map((detail) => [detail.field, detail.value?.text]) ?? [],
      );

    expect(fieldsOf('list.exported')).toMatchObject({ Filters: 'Search SO' });
    expect(Object.keys(fieldsOf('organization.exported')).sort()).toEqual([
      'Documents',
      'Files',
      'Rows',
      'Tables',
    ]);
    expect(fieldsOf('organization.deletion_scheduled')).toEqual({
      'Deleted after': deletionDayFor(new Date()),
      'Copy of everything': 'Downloaded',
      'Account deleted too': 'No',
    });
    // An undeclared key reads as "Detail" (audit-fields.ts).
    for (const entry of worded) {
      for (const detail of entry.details) {
        expect(detail.field, entry.action).not.toBe('Detail');
      }
    }
  });

  it('puts no id anywhere a person reads, on screen or in the CSV', async () => {
    const { alpha } = await promoted();

    for (const entry of await entries(alpha, 'zh-Hans')) {
      expect(entry.actionName).not.toMatch(UUID);
      for (const detail of entry.details) {
        expect(detail.field).not.toMatch(UUID);
        expect(detail.from?.text ?? '').not.toMatch(UUID);
        expect(detail.value?.text ?? '').not.toMatch(UUID);
      }
    }

    const csv = await alpha.agent
      .get('/v1/audit/export')
      .set('Accept-Language', 'zh-Hans')
      .expect(200);
    expect(csv.text).not.toMatch(UUID);
    expect(csv.text).not.toContain('user.role_changed');
    expect(csv.text).not.toContain('{');
    expect(csv.text).toContain('查看者 → 管理员');
  });

  it('names each action for the filter', async () => {
    const { alpha } = await promoted();
    const res = await alpha.agent
      .get('/v1/audit/actions')
      .set('Accept-Language', 'en')
      .expect(200);
    const actions = body<{ action: string; name: string }[]>(res);
    const changed = actions.find(
      (each) => each.action === 'member.roles_changed',
    );
    expect(changed?.name).toMatch(/\S/);
    expect(changed?.name).not.toBe('member.roles_changed');
  });
});
