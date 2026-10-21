import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  ALL_PERMISSIONS,
  LOCKED_PERMISSIONS,
  type Permission,
  ROLE_TEMPLATES,
} from '../src/core/authorization/permissions';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { invitationRoles, roles, users } from '../src/database/schema';
import french from '../src/i18n/fr-CA.json';
import chinese from '../src/i18n/zh-Hans.json';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  invitationToken,
  PASSWORD,
  registerOrganization,
  roleIdNamed,
  roleIdsOf,
} from './utils/fixtures';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';

type Agent = ReturnType<typeof authedAgent>;
type Owner = Awaited<ReturnType<typeof registerOrganization>>;

interface RoleResponse {
  id: string;
  name: string;
  description: string | null;
  builtIn: boolean;
  permissions: Permission[];
  holderCount: number;
  mayGive: boolean;
}

interface RoleDetailResponse extends RoleResponse {
  holders: {
    id: string;
    name: string;
    email: string;
    photoFileId: string | null;
    roles: { id: string; name: string; builtIn: boolean }[];
  }[];
  updatedAt: string;
}

interface Refusal {
  message: string;
  code?: string;
}

interface AuditEntry {
  action: string;
  resourceId: string | null;
  actionName: string;
  details: {
    field: string;
    changed: boolean;
    from: { text: string } | null;
    value: { text: string } | null;
  }[];
}

/** A template's grants, without the three every role holds. */
const template = (key: keyof typeof ROLE_TEMPLATES) =>
  ROLE_TEMPLATES[key].permissions.filter(
    (permission) => !LOCKED_PERMISSIONS.includes(permission),
  );

/**
 * ADR-080: roles an organization makes, several to a member, given only by
 * someone whose roles hold all they grant; prices on orders a permission of
 * their own; and the refusal in the reader's words.
 */
describe('Roles (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  let mail: RecordingMailService;

  beforeAll(async () => {
    mail = new RecordingMailService();
    app = await createE2eApp(mail);
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
    mail.reset();
  });

  /** An organization whose Owner may invite: their address confirmed. */
  async function organization(slugish: string): Promise<Owner> {
    const owner = await registerOrganization(app, slugish);
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, owner.userId));
    return owner;
  }

  /** A role made by the Owner, through the route. */
  async function make(
    owner: Owner,
    name: string,
    permissions: readonly Permission[],
    description?: string,
  ): Promise<RoleDetailResponse> {
    return body<RoleDetailResponse>(
      await owner.agent
        .post('/v1/roles')
        .send({ name, description, permissions })
        .expect(201),
    );
  }

  /** A member invited with these roles, who accepted under this name. */
  async function join(
    inviter: { agent: Agent },
    email: string,
    roleIds: string[],
    name: string,
  ): Promise<{ agent: Agent; id: string }> {
    await inviter.agent
      .post('/v1/invitations')
      .send({ email, roleIds })
      .expect(201);
    const agent = authedAgent(app);
    await agent
      .post('/v1/invitations/accept')
      .send({ token: invitationToken(app, email), name, password: PASSWORD })
      .expect(200);
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email));
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
    return { agent, id: user.id };
  }

  const builtIn = (owner: Owner, name: string) =>
    roleIdNamed(app, owner.organizationId, name);

  async function audit(owner: Owner, query: string, language = 'en') {
    return body<{ entries: AuditEntry[] }>(
      await owner.agent
        .get(`/v1/audit${query}`)
        .set('Accept-Language', language)
        .expect(200),
    ).entries;
  }

  describe('reading', () => {
    it('lists the built-in three first, each line in the reader’s language, what it grants, who holds it and whether the reader may give it', async () => {
      const alpha = await organization('alpha');
      const admin = await join(
        alpha,
        'ana@example.com',
        [await builtIn(alpha, 'Admin')],
        'Ana Ruiz',
      );

      const listed = body<RoleResponse[]>(
        await admin.agent
          .get('/v1/roles')
          .set('Accept-Language', 'fr-CA')
          .expect(200),
      );
      expect(listed.map((role) => role.name)).toEqual([
        'Owner',
        'Admin',
        'Viewer',
      ]);
      const [owner, adminRole, viewer] = listed;
      expect(owner).toMatchObject({
        builtIn: true,
        description: french['roles.description.owner'],
        holderCount: 1,
        // An Admin's roles hold less than an Owner's.
        mayGive: false,
      });
      expect(owner.permissions).toEqual(ALL_PERMISSIONS);
      expect(adminRole).toMatchObject({ holderCount: 1, mayGive: true });
      expect(viewer).toMatchObject({ holderCount: 0, mayGive: true });
      expect(viewer.permissions).toContain('orders.view_prices');
    });

    it('offers the catalogue: every permission with its line and needs, and the templates, in the reader’s language', async () => {
      const alpha = await organization('alpha');

      const catalogue = body<{
        permissions: {
          key: Permission;
          line: string;
          note: string | null;
          needs: Permission[];
          offered: boolean;
          locked: boolean;
        }[];
        templates: { key: string; name: string; permissions: Permission[] }[];
      }>(
        await alpha.agent
          .get('/v1/roles/catalogue')
          .set('Accept-Language', 'zh-Hans')
          .expect(200),
      );

      expect(catalogue.permissions.map((each) => each.key)).toEqual(
        ALL_PERMISSIONS,
      );
      const byKey = new Map(
        catalogue.permissions.map((each) => [each.key, each]),
      );
      expect(byKey.get('orders.receive')).toEqual({
        key: 'orders.receive',
        line: chinese['permissions.orders.receive'],
        note: null,
        needs: ['orders.view', 'locations.view'],
        offered: true,
        locked: false,
      });
      expect(byKey.get('users.view')).toMatchObject({ locked: true });
      expect(byKey.get('roles.update')).toMatchObject({ offered: false });
      expect(byKey.get('orders.update')?.note).toBe(
        chinese['permissions.note.closedShort'],
      );
      expect(catalogue.templates.map((each) => each.name)).toEqual([
        chinese['roles.template.warehouse'],
        chinese['roles.template.sales'],
        chinese['roles.template.finance'],
        chinese['roles.template.production'],
        chinese['roles.template.stockLookup'],
      ]);
    });

    it('shows a role’s page with who holds it, and every role each holds', async () => {
      const alpha = await organization('alpha');
      const viewer = await builtIn(alpha, 'Viewer');
      const lead = await make(alpha, 'Warehouse lead', template('warehouse'));
      const sam = await join(
        alpha,
        'sam@example.com',
        [viewer, lead.id],
        'Sam Lee',
      );

      const page = body<RoleDetailResponse>(
        await alpha.agent.get(`/v1/roles/${viewer}`).expect(200),
      );
      expect(page.holders).toEqual([
        {
          id: sam.id,
          name: 'Sam Lee',
          email: 'sam@example.com',
          photoFileId: null,
          roles: [
            { id: viewer, name: 'Viewer', builtIn: true },
            { id: lead.id, name: 'Warehouse lead', builtIn: false },
          ],
        },
      ]);
      expect(page.holderCount).toBe(1);
    });
  });

  describe('making, changing and deleting', () => {
    it('makes a role from a template, with the three every role holds, and logs what it grants in words', async () => {
      const alpha = await organization('alpha');

      const made = await make(
        alpha,
        'Warehouse lead',
        template('warehouse'),
        'Receives and ships',
      );
      expect(made).toMatchObject({
        name: 'Warehouse lead',
        description: 'Receives and ships',
        builtIn: false,
        holderCount: 0,
        holders: [],
        mayGive: true,
      });
      expect(new Set(made.permissions)).toEqual(
        new Set(ROLE_TEMPLATES.warehouse.permissions),
      );

      const [entry] = await audit(alpha, '?action=role.created');
      expect(entry.resourceId).toBe(made.id);
      expect(entry.actionName).toBe('Role made');
      const granted = entry.details.find(
        (each) => each.field === 'Permissions',
      );
      expect(granted?.value?.text).toContain(
        '“Receive stock against an order”',
      );
      expect(granted?.value?.text).not.toMatch(/orders\.receive/);
    });

    it('refuses what stays the Owners’, a permission without its needs, and a name that cannot be used', async () => {
      const alpha = await organization('alpha');
      await make(alpha, 'Warehouse lead', template('warehouse'));

      await alpha.agent
        .post('/v1/roles')
        .send({ name: 'Editors', permissions: ['roles.update'] })
        .expect(400);

      const needs = body<Refusal>(
        await alpha.agent
          .post('/v1/roles')
          .send({ name: 'Dock', permissions: ['orders.receive'] })
          .expect(400),
      );
      expect(needs.code).toBe('permission_requires');
      expect(needs.message).toBe(
        '“Receive stock against an order” needs “See purchase and sales orders” and “See warehouses, zones and bins” too.',
      );

      const taken = body<Refusal>(
        await alpha.agent
          .post('/v1/roles')
          .send({ name: 'warehouse LEAD', permissions: [] })
          .expect(409),
      );
      expect(taken.message).toBe(
        'There’s already a role called warehouse LEAD.',
      );
      // The editor marks its Name field by the code.
      expect(taken.code).toBe('role_name_unavailable');
      // A built-in role's name in any of the app's languages, any case.
      for (const name of ['admin', 'Propriétaire', '查看者']) {
        const refused = body<Refusal>(
          await alpha.agent
            .post('/v1/roles')
            .send({ name, permissions: [] })
            .expect(409),
        );
        expect(refused.message).toBe(
          `${name} is a built-in role. Choose another name.`,
        );
        expect(refused.code).toBe('role_name_unavailable');
      }

      await alpha.agent
        .post('/v1/roles')
        .send({ name: 'x'.repeat(51), permissions: [] })
        .expect(400);
      await alpha.agent
        .post('/v1/roles')
        .send({
          name: 'Packers',
          description: 'x'.repeat(201),
          permissions: [],
        })
        .expect(400);
      await alpha.agent
        .post('/v1/roles')
        .send({
          name: 'x'.repeat(50),
          description: 'x'.repeat(200),
          permissions: [],
        })
        .expect(201);
    });

    it('leaves making roles to Owners, refused in the reader’s words', async () => {
      const alpha = await organization('alpha');
      const admin = await join(
        alpha,
        'ana@example.com',
        [await builtIn(alpha, 'Admin')],
        'Ana Ruiz',
      );

      const refused = body<Refusal>(
        await admin.agent
          .post('/v1/roles')
          .send({ name: 'Packers', permissions: [] })
          .expect(403),
      );
      // An Admin may change roles, but not give what their roles lack.
      expect(refused.message).toBe(
        'Your role, Admin, doesn’t include “Make a role”. Owner can change your roles.',
      );
    });

    it('changes a made role, logging what moved, and refuses a save made after someone else’s, naming them', async () => {
      const alpha = await organization('alpha');
      const mei = await join(
        alpha,
        'mei@example.com',
        [await builtIn(alpha, 'Owner')],
        'Mei Lin',
      );
      const role = await make(alpha, 'Warehouse lead', template('warehouse'));

      // Mei saves first, from the page as both read it.
      const saved = body<RoleDetailResponse>(
        await mei.agent
          .patch(`/v1/roles/${role.id}`)
          .send({
            name: 'Dock',
            description: 'The loading dock',
            permissions: [
              ...template('warehouse').filter((key) => key !== 'orders.ship'),
              'stock.adjust',
            ],
            updatedAt: role.updatedAt,
          })
          .expect(200),
      );
      expect(saved.name).toBe('Dock');
      expect(saved.permissions).toContain('stock.adjust');
      expect(saved.permissions).not.toContain('orders.ship');

      const stale = body<Refusal>(
        await alpha.agent
          .patch(`/v1/roles/${role.id}`)
          .send({
            name: 'Warehouse lead',
            permissions: template('warehouse'),
            updatedAt: role.updatedAt,
          })
          .expect(409),
      );
      expect(stale.code).toBe('role_changed');
      expect(stale.message).toBe(
        'Mei Lin saved Dock while you were editing it. Your changes weren’t saved. Reload to see theirs, then make yours again.',
      );

      const [entry] = await audit(alpha, '?action=role.updated');
      expect(entry.actionName).toBe('Role changed');
      const field = (name: string) =>
        entry.details.find((each) => each.field === name);
      expect(field('Name')).toMatchObject({
        changed: true,
        from: { text: 'Warehouse lead' },
        value: { text: 'Dock' },
      });
      expect(field('Permissions added')?.value?.text).toBe(
        '“Correct a count when the system is wrong”',
      );
      expect(field('Permissions removed')?.value?.text).toBe(
        '“Ship stock against a sales order”',
      );
    });

    it('never changes or deletes a built-in role', async () => {
      const alpha = await organization('alpha');
      const viewer = await builtIn(alpha, 'Viewer');
      const page = body<RoleDetailResponse>(
        await alpha.agent.get(`/v1/roles/${viewer}`).expect(200),
      );

      await alpha.agent
        .patch(`/v1/roles/${viewer}`)
        .send({
          name: 'Readers',
          permissions: page.permissions,
          updatedAt: page.updatedAt,
        })
        .expect(409);
      await alpha.agent.delete(`/v1/roles/${viewer}`).expect(409);
    });

    it('deletes a role nobody holds and no live invitation names; one that ended drops it', async () => {
      const alpha = await organization('alpha');
      const role = await make(alpha, 'Packers', template('stock_lookup'));

      // Named by an invitation waiting to be accepted.
      const { invitation } = body<{ invitation: { id: string } }>(
        await alpha.agent
          .post('/v1/invitations')
          .send({ email: 'sam@example.com', roleIds: [role.id] })
          .expect(201),
      );
      const invited = body<Refusal>(
        await alpha.agent.delete(`/v1/roles/${role.id}`).expect(409),
      );
      expect(invited.message).toBe(
        'An invitation waiting to be accepted names Packers. Revoke it, or wait until it’s accepted, then delete the role.',
      );

      // Held by a member: how many, and Move everyone offered by code.
      const pat = await join(alpha, 'pat@example.com', [role.id], 'Pat Kim');
      const held = body<Refusal>(
        await alpha.agent.delete(`/v1/roles/${role.id}`).expect(409),
      );
      expect(held).toMatchObject({
        code: 'role_held',
        message: '1 member holds Packers. Move them to another role first.',
      });

      await alpha.agent
        .patch(`/v1/users/${pat.id}`)
        .send({ roleIds: [await builtIn(alpha, 'Viewer')] })
        .expect(204);
      await alpha.agent.delete(`/v1/invitations/${invitation.id}`).expect(204);
      await alpha.agent.delete(`/v1/roles/${role.id}`).expect(204);

      // The revoked invitation and Pat's accepted one name it no more.
      expect(
        await db
          .select()
          .from(invitationRoles)
          .where(eq(invitationRoles.roleId, role.id)),
      ).toEqual([]);
      // The log keeps what it granted.
      const [entry] = await audit(alpha, '?action=role.deleted');
      expect(
        entry.details.find((each) => each.field === 'Name')?.value?.text,
      ).toBe('Packers');
      expect(
        entry.details.find((each) => each.field === 'Permissions')?.value?.text,
      ).toContain('“See what is on hand and where”');
    });
  });

  describe('a member’s roles', () => {
    it('adds roles together, and takes one away', async () => {
      const alpha = await organization('alpha');
      const warehouse = await make(alpha, 'Warehouse', template('warehouse'));
      const sales = await make(alpha, 'Sales', template('sales'));
      const wang = await join(
        alpha,
        'wang@example.com',
        [warehouse.id, sales.id],
        'Wang Fang',
      );

      // Sales sees partners; Warehouse moves stock.
      await wang.agent.get('/v1/partners').expect(200);
      const { permissions } = body<{ permissions: Permission[] }>(
        await wang.agent.get('/v1/auth/me').expect(200),
      );
      expect(permissions).toEqual(
        expect.arrayContaining(['partners.view', 'stock.move']),
      );

      await alpha.agent
        .patch(`/v1/users/${wang.id}`)
        .send({ roleIds: [warehouse.id] })
        .expect(204);
      await wang.agent.get('/v1/partners').expect(403);
      expect(await roleIdsOf(app, wang.id)).toEqual([warehouse.id]);

      // Recorded from and to, in words.
      const [entry] = await audit(alpha, '?action=member.roles_changed');
      const [roles] = entry.details;
      expect(roles).toMatchObject({
        field: 'Roles',
        changed: true,
        from: { text: 'Warehouse and Sales' },
        value: { text: 'Warehouse' },
      });
    });

    it('keeps Owner alone, and every member at least one role', async () => {
      const alpha = await organization('alpha');
      const sam = await join(
        alpha,
        'sam@example.com',
        [await builtIn(alpha, 'Viewer')],
        'Sam Lee',
      );

      const alone = body<Refusal>(
        await alpha.agent
          .patch(`/v1/users/${sam.id}`)
          .send({
            roleIds: [
              await builtIn(alpha, 'Owner'),
              await builtIn(alpha, 'Viewer'),
            ],
          })
          .expect(400),
      );
      expect(alone.message).toBe(
        'An Owner holds no other role: Owner already includes everything.',
      );
      await alpha.agent
        .patch(`/v1/users/${sam.id}`)
        .send({ roleIds: [] })
        .expect(400);
      await alpha.agent
        .post('/v1/invitations')
        .send({ email: 'pat@example.com', roleIds: [] })
        .expect(400);
    });

    it('gives only what the giver’s roles hold, in each language, the Owner refusals keeping their words', async () => {
      const alpha = await organization('alpha');
      const finance = await make(alpha, 'Finance', template('finance'));
      const admin = await join(
        alpha,
        'ana@example.com',
        [await builtIn(alpha, 'Admin')],
        'Ana Ruiz',
      );
      const sam = await join(
        alpha,
        'sam@example.com',
        [await builtIn(alpha, 'Viewer')],
        'Sam Lee',
      );

      // Finance issues invoices and sees costs, which Admin does not.
      for (const [language, words] of [
        [
          'en',
          'Your roles don’t include everything Finance can do, so you can’t give it.',
        ],
        [
          'fr-CA',
          'Vos rôles n’incluent pas toutes les permissions de Finance; vous ne pouvez donc pas le donner.',
        ],
        ['zh-Hans', '您的角色不包含Finance的全部权限，因此您不能授予此角色。'],
      ]) {
        const refused = body<Refusal>(
          await admin.agent
            .patch(`/v1/users/${sam.id}`)
            .set('Accept-Language', language)
            .send({ roleIds: [finance.id] })
            .expect(403),
        );
        expect(refused.message).toBe(words);
      }
      await admin.agent
        .post('/v1/invitations')
        .send({ email: 'pat@example.com', roleIds: [finance.id] })
        .expect(403);

      // Nor change or remove someone whose roles do more than theirs.
      await alpha.agent
        .patch(`/v1/users/${sam.id}`)
        .send({ roleIds: [finance.id] })
        .expect(204);
      const change = body<Refusal>(
        await admin.agent
          .patch(`/v1/users/${sam.id}`)
          .send({ roleIds: [await builtIn(alpha, 'Viewer')] })
          .expect(403),
      );
      expect(change.message).toBe(
        'Your roles don’t include everything Sam Lee’s roles can do, so you can’t change their roles.',
      );
      const remove = body<Refusal>(
        await admin.agent.delete(`/v1/users/${sam.id}`).expect(403),
      );
      expect(remove.message).toBe(
        'Your roles don’t include everything Sam Lee’s roles can do, so you can’t remove them.',
      );

      // Owner as ADR-016 has it.
      const owner = body<Refusal>(
        await admin.agent
          .patch(`/v1/users/${sam.id}`)
          .send({ roleIds: [await builtIn(alpha, 'Owner')] })
          .expect(403),
      );
      expect(owner.message).toBe('Only an Owner can assign the Owner role');
    });

    it('leaves an Owner when two Owners demote each other at once', async () => {
      const alpha = await organization('alpha');
      const owner = await builtIn(alpha, 'Owner');
      const viewer = await builtIn(alpha, 'Viewer');
      const mei = await join(alpha, 'mei@example.com', [owner], 'Mei Lin');

      const statuses = (
        await Promise.all([
          alpha.agent.patch(`/v1/users/${mei.id}`).send({ roleIds: [viewer] }),
          mei.agent
            .patch(`/v1/users/${alpha.userId}`)
            .send({ roleIds: [viewer] }),
        ])
      ).map((res) => res.status);

      // One demotes; the other, counted under the lock, is no longer an
      // Owner by then.
      expect(statuses.sort()).toEqual([204, 403]);
      const owners = [
        ...(await roleIdsOf(app, alpha.userId)),
        ...(await roleIdsOf(app, mei.id)),
      ].filter((id) => id === owner);
      expect(owners).toHaveLength(1);
    });
  });

  describe('Move everyone', () => {
    it('moves every holder, one log entry each, under the rule that only what you hold can be given', async () => {
      const alpha = await organization('alpha');
      const viewer = await builtIn(alpha, 'Viewer');
      const warehouse = await make(alpha, 'Warehouse', template('warehouse'));
      const finance = await make(alpha, 'Finance', template('finance'));
      const sam = await join(alpha, 'sam@example.com', [viewer], 'Sam Lee');
      const pat = await join(alpha, 'pat@example.com', [viewer], 'Pat Kim');
      const admin = await join(
        alpha,
        'ana@example.com',
        [await builtIn(alpha, 'Admin')],
        'Ana Ruiz',
      );

      const refused = body<Refusal>(
        await admin.agent
          .post(`/v1/roles/${viewer}/move`)
          .send({ toRoleId: finance.id })
          .expect(403),
      );
      expect(refused.message).toBe(
        'Your roles don’t include everything Finance can do, so you can’t give it.',
      );

      const emptied = body<RoleDetailResponse>(
        await admin.agent
          .post(`/v1/roles/${viewer}/move`)
          .send({ toRoleId: warehouse.id })
          .expect(200),
      );
      expect(emptied.holders).toEqual([]);
      expect(await roleIdsOf(app, sam.id)).toEqual([warehouse.id]);
      expect(await roleIdsOf(app, pat.id)).toEqual([warehouse.id]);

      const entries = await audit(alpha, '?action=member.roles_changed');
      expect(entries.map((entry) => entry.resourceId).sort()).toEqual(
        [sam.id, pat.id].sort(),
      );

      // Moving every Owner would leave none.
      await alpha.agent
        .post(`/v1/roles/${await builtIn(alpha, 'Owner')}/move`)
        .send({ toRoleId: viewer })
        .expect(409);
    });
  });

  describe('a refusal in words (#148)', () => {
    it('says which of the reader’s roles lack what, and whom to ask, in each language', async () => {
      const alpha = await organization('alpha');
      const packers = await make(alpha, 'Packers', template('stock_lookup'));
      const packer = await join(
        alpha,
        'sam@example.com',
        [packers.id],
        'Sam Lee',
      );

      const english = body<Refusal>(
        await packer.agent.get('/v1/costs/valuation').expect(403),
      );
      expect(english.message).toBe(
        'Your role, Packers, doesn’t include “See what stock, lots and batches cost, and exchange rates”. Owner can change your roles.',
      );
      const inFrench = body<Refusal>(
        await packer.agent
          .get('/v1/costs/valuation')
          .set('Accept-Language', 'fr-CA')
          .expect(403),
      );
      expect(inFrench.message).toBe(
        `Votre rôle, Packers, ne comprend pas «\u00a0${french['permissions.costs.view']}\u00a0». Owner peut modifier vos rôles.`,
      );
      const inChinese = body<Refusal>(
        await packer.agent
          .get('/v1/costs/valuation')
          .set('Accept-Language', 'zh-Hans')
          .expect(403),
      );
      expect(inChinese.message).toBe(
        `您的角色（Packers）不包含“${chinese['permissions.costs.view']}”。Owner 可以更改您的角色。`,
      );

      // Several roles, and the recently opened records' own refusal.
      const sales = await make(alpha, 'Sales', template('sales'));
      await alpha.agent
        .patch(`/v1/users/${packer.id}`)
        .send({ roleIds: [packers.id, sales.id] })
        .expect(204);
      const recent = body<Refusal>(
        await packer.agent
          .post('/v1/recent')
          .send({
            kind: 'run',
            id: '01a1522b-9d85-7367-8cdd-796c3ee07a68',
          })
          .expect(403),
      );
      expect(recent.message).toBe(
        'None of your roles, Packers and Sales, includes “See production runs and what they consumed”. Owner can change your roles.',
      );
    });

    it('names up to three who could give what is lacking, the Owners first, never the reader', async () => {
      const alpha = await organization('alpha');
      const packers = await make(alpha, 'Packers', template('stock_lookup'));
      // Everything Packers holds, costs and changing roles: could give it.
      const leads = await make(alpha, 'Leads', [
        ...template('stock_lookup'),
        'costs.view',
        'roles.assign',
      ]);
      // Costs and changing roles, but not all Packers holds, so could not
      // change a packer's roles at all.
      const bookkeepers = await make(alpha, 'Bookkeepers', [
        ...template('finance'),
        'roles.assign',
      ]);
      // Costs, without changing roles.
      const costing = await make(alpha, 'Costing', [
        ...template('stock_lookup'),
        'costs.view',
      ]);

      const packer = await join(
        alpha,
        'sam@example.com',
        [packers.id],
        'Sam Lee',
      );
      await join(alpha, 'ada@example.com', [leads.id], 'Ada Byrne');
      const admin = await join(
        alpha,
        'ben@example.com',
        [await builtIn(alpha, 'Admin')],
        'Ben Cole',
      );
      await join(alpha, 'dee@example.com', [bookkeepers.id], 'Dee Park');
      await join(alpha, 'cy@example.com', [costing.id], 'Cy Wu');
      // An Owner who joined after Ada, named before her; and a second lead,
      // past the three.
      await join(
        alpha,
        'olu@example.com',
        [await builtIn(alpha, 'Owner')],
        'Olu Ade',
      );
      await join(alpha, 'eve@example.com', [leads.id], 'Eve Moss');

      const refused = (agent: Agent, language = 'en') =>
        agent
          .get('/v1/costs/valuation')
          .set('Accept-Language', language)
          .expect(403)
          .then((res) => body<Refusal>(res).message);
      const costs =
        '“See what stock, lots and batches cost, and exchange rates”';

      expect(await refused(packer.agent)).toBe(
        `Your role, Packers, doesn’t include ${costs}. Owner, Olu Ade, and Ada Byrne can change your roles.`,
      );
      expect(await refused(packer.agent, 'fr-CA')).toBe(
        `Votre rôle, Packers, ne comprend pas «\u00a0${french['permissions.costs.view']}\u00a0». Owner, Olu Ade et Ada Byrne peuvent modifier vos rôles.`,
      );
      expect(await refused(packer.agent, 'zh-Hans')).toBe(
        `您的角色（Packers）不包含“${chinese['permissions.costs.view']}”。Owner、Olu Ade和Ada Byrne 可以更改您的角色。`,
      );

      // An Admin may change roles, and is told of the Owners, who can give
      // it: not Ada, whose Leads holds less than Admin does, and never the
      // Admin themself.
      expect(await refused(admin.agent)).toBe(
        `Your role, Admin, doesn’t include ${costs}. Owner and Olu Ade can change your roles.`,
      );
    });
  });

  describe('prices on orders', () => {
    it('reads an order without its prices, totals or tax, and refuses its priced documents', async () => {
      const alpha = await organization('alpha');
      const sale = await shippedSale(alpha.agent);
      await alpha.agent
        .post('/v1/invoices')
        .send({ shipmentId: sale.shipmentId })
        .expect(201);
      const supplier = await createPartner(alpha.agent, { name: 'Supplier' });
      const variant = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Bottles',
        variant: { sku: 'BOTTLE' },
      });
      const purchase = body<{ order: { id: string } }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: supplier,
            direction: 'purchase',
            lines: [
              {
                variantId: variant,
                quantityOrdered: '5',
                unitPrice: '2',
                currency: 'CAD',
              },
            ],
          })
          .expect(201),
      ).order;

      const warehouse = await make(alpha, 'Warehouse', template('warehouse'));
      const dock = await join(
        alpha,
        'sam@example.com',
        [warehouse.id],
        'Sam Lee',
      );

      const order = body<Record<string, unknown>>(
        await dock.agent.get(`/v1/orders/${sale.orderId}`).expect(200),
      );
      for (const absent of ['totals', 'totalsComplete', 'money', 'documents']) {
        expect(order, absent).not.toHaveProperty(absent);
      }
      expect(order.counts).not.toHaveProperty('documents');
      const lines = order.lines as Record<string, unknown>[];
      for (const absent of [
        'unitPrice',
        'currency',
        'priceSource',
        'priceListId',
        'priceListName',
        'lineTotal',
      ]) {
        expect(lines[0], absent).not.toHaveProperty(absent);
      }

      await dock.agent.get(`/v1/orders/${sale.orderId}/pro-forma`).expect(403);
      await dock.agent.get(`/v1/orders/${purchase.id}/pdf`).expect(403);
      // The packing slip never had prices.
      await dock.agent
        .get(`/v1/orders/${sale.orderId}/shipments/${sale.shipmentId}/pdf`)
        .expect(200);

      // Invoices are prices by nature, and keep invoices.view: what was
      // billed reaches a reader of invoices, never what the lines are worth.
      const clerk = await make(alpha, 'Billing clerk', [
        'orders.view',
        'invoices.view',
      ]);
      const billing = await join(
        alpha,
        'pat@example.com',
        [clerk.id],
        'Pat Kim',
      );
      const billed = body<{
        money: Record<string, unknown>;
        documents: { invoices: unknown[] };
      }>(await billing.agent.get(`/v1/orders/${sale.orderId}`).expect(200));
      expect(billed.documents.invoices).toHaveLength(1);
      expect(billed.money).toHaveProperty('invoiced');
      expect(billed.money).not.toHaveProperty('notInvoiced');
      expect(billed).not.toHaveProperty('totals');

      // A Viewer sees what they saw.
      const viewer = await join(
        alpha,
        'lee@example.com',
        [await builtIn(alpha, 'Viewer')],
        'Lee Wong',
      );
      const read = body<{ totals: unknown[]; money: { notInvoiced: string } }>(
        await viewer.agent.get(`/v1/orders/${sale.orderId}`).expect(200),
      );
      expect(read.totals).toHaveLength(1);
      expect(read.money.notInvoiced).toBeDefined();
    });
  });

  describe('inviting with several roles', () => {
    it('names them as a list in the email, on its page and in the bell, and gives them all', async () => {
      const alpha = await organization('alpha');
      const warehouse = await make(alpha, 'Warehouse', template('warehouse'));
      const sales = await make(alpha, 'Sales', template('sales'));

      const { invitation } = body<{
        invitation: { roles: { name: string; builtIn: boolean }[] };
      }>(
        await alpha.agent
          .post('/v1/invitations')
          .send({
            email: 'wang@example.com',
            roleIds: [warehouse.id, sales.id],
            locale: 'fr-CA',
          })
          .expect(201),
      );
      expect(invitation.roles.map((role) => role.name)).toEqual([
        'Warehouse',
        'Sales',
      ]);
      expect(mail.lastTo('wang@example.com')?.text).toContain(
        'en tant que Warehouse et Sales.',
      );

      const token = invitationToken(app, 'wang@example.com');
      const preview = body<{
        invitation: { roles: { name: string; system: string | null }[] };
      }>(
        await authedAgent(app)
          .post('/v1/invitations/read')
          .send({ token })
          .expect(200),
      ).invitation;
      expect(preview.roles).toEqual([
        { name: 'Warehouse', description: null, system: null },
        { name: 'Sales', description: null, system: null },
      ]);

      await authedAgent(app)
        .post('/v1/invitations/accept')
        .send({ token, name: 'Wang Fang', password: PASSWORD })
        .expect(200);
      const [wang] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, 'wang@example.com'));
      expect((await roleIdsOf(app, wang.id)).sort()).toEqual(
        [warehouse.id, sales.id].sort(),
      );

      const { entries } = body<{ entries: { body: string | null }[] }>(
        await alpha.agent.get('/v1/notifications').expect(200),
      );
      expect(entries[0].body).toBe(
        'Wang Fang accepted your invitation and joined alpha Co as Warehouse and Sales.',
      );
    });
  });

  describe('the first week (ADR-079, amended)', () => {
    it('offers Receive to whoever may receive against an order, moving stock or not', async () => {
      const alpha = await organization('alpha');
      // Getting started out of the way, so the week is the whole list.
      await alpha.agent.post('/v1/home/getting-started/dismiss').expect(204);
      const receiver = await make(alpha, 'Receiving', [
        'orders.view',
        'orders.receive',
        'locations.view',
      ]);
      const sam = await join(
        alpha,
        'sam@example.com',
        [receiver.id],
        'Sam Lee',
      );

      const { welcome } = body<{
        welcome: { items: { key: string }[] } | null;
      }>(await sam.agent.get('/v1/home').expect(200));
      expect(welcome?.items.map((item) => item.key)).toContain('receiveStock');
    });
  });

  describe('receiving without the catalogue', () => {
    it('reads from the line whether it tracks lots, and its unit, and receives a lot without products.view', async () => {
      const alpha = await organization('alpha');
      const supplier = await createPartner(alpha.agent, { name: 'Supplier' });
      const variant = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Fish oil',
        variant: { sku: 'OIL', unitOfMeasure: 'kg', tracksLots: true },
      });
      const into = await createLocation(alpha.agent, {
        type: 'site',
        name: 'Main',
      });
      const order = body<{ order: { id: string; lines: { id: string }[] } }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: supplier,
            direction: 'purchase',
            lines: [{ variantId: variant, quantityOrdered: '10' }],
          })
          .expect(201),
      ).order;
      await alpha.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      const receiver = await make(alpha, 'Receiving', [
        'orders.view',
        'orders.receive',
        'locations.view',
      ]);
      const sam = await join(
        alpha,
        'sam@example.com',
        [receiver.id],
        'Sam Lee',
      );
      await sam.agent.get(`/v1/products`).expect(403);

      const read = body<{
        lines: { tracksLots: boolean; unitOfMeasure: string }[];
      }>(await sam.agent.get(`/v1/orders/${order.id}`).expect(200));
      expect(read.lines[0]).toMatchObject({
        tracksLots: true,
        unitOfMeasure: 'kg',
      });

      await sam.agent
        .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
        .send({ toLocationId: into, quantity: '4', lot: { code: 'OIL-0425' } })
        .expect(201);
    });
  });

  describe('a replacement for a return', () => {
    it('needs orders.create beside the return’s own update', async () => {
      const alpha = await organization('alpha');
      const desk = await make(alpha, 'Returns desk', [
        'orders.view',
        'return_authorizations.view',
        'return_authorizations.update',
      ]);
      const sam = await join(alpha, 'sam@example.com', [desk.id], 'Sam Lee');

      // Refused by the guard, before the RMA is looked for.
      const refused = body<Refusal>(
        await sam.agent
          .post(
            '/v1/return-authorizations/01a1522b-9d85-7367-8cdd-796c3ee07a68/replacement',
          )
          .expect(403),
      );
      expect(refused.message).toContain('“Raise an order”');
    });
  });

  it('keeps every role in its own organization', async () => {
    const alpha = await organization('alpha');
    const beta = await organization('beta');
    const theirs = await make(beta, 'Warehouse', template('warehouse'));

    await alpha.agent.get(`/v1/roles/${theirs.id}`).expect(404);
    await alpha.agent
      .post(`/v1/roles/${await builtIn(alpha, 'Viewer')}/move`)
      .send({ toRoleId: theirs.id })
      .expect(400);
    await alpha.agent
      .post('/v1/invitations')
      .send({ email: 'sam@example.com', roleIds: [theirs.id] })
      .expect(400);
    await alpha.agent.delete(`/v1/roles/${theirs.id}`).expect(404);
    const [row] = await db
      .select({ name: roles.name })
      .from(roles)
      .where(
        and(
          eq(roles.id, theirs.id),
          eq(roles.organizationId, beta.organizationId),
        ),
      );
    expect(row.name).toBe('Warehouse');
  });
});
