import {
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { tablePages } from './table-diagrams-pages';

const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
});
const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
});
const orders = pgTable('orders', {
  id: uuid('id').primaryKey(),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  voidedBy: uuid('voided_by').references(() => users.id),
  total: numeric('total', { precision: 18, scale: 4 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});
const orderTags = pgTable(
  'order_tags',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id),
    tag: text('tag').notNull(),
  },
  (table) => [primaryKey({ columns: [table.organizationId, table.orderId] })],
);

const schema = { organizations, users, orders, orderTags, notATable: 'x' };
const AREAS = ['orders', 'organizations', 'users', 'docs'];
const AREAS_OF = {
  orders: ['order_tags', 'orders'],
  organizations: ['organizations'],
  users: ['users'],
};

describe('npm run diagrams', () => {
  it('draws each table of an area, organization_id and its key left out', () => {
    const { pages, failures } = tablePages(schema, AREAS_OF, AREAS);

    expect(failures).toEqual([]);
    expect(pages.get('orders.md')).toContain(
      [
        '```mermaid',
        'erDiagram',
        '  order_tags {',
        '    uuid order_id PK, FK',
        '    text tag',
        '  }',
        '  orders {',
        '    uuid id PK',
        '    uuid created_by FK',
        '    uuid voided_by FK',
        '    numeric(18,4) total',
        '    timestamptz created_at',
        '  }',
        '  order_tags }o--|| orders : "order_id"',
        '  orders }o--|| users : "created_by"',
        '  orders }o--o| users : "voided_by"',
        '```',
      ].join('\n'),
    );
    expect(pages.get('orders.md')).not.toContain('organization');
  });

  it('draws a table of another area bare, and links its area', () => {
    const { pages } = tablePages(schema, AREAS_OF, AREAS);

    expect(pages.get('orders.md')).toContain(
      'From other areas, drawn bare:\n\n- [users](users.md): `users`\n',
    );
    // Each foreign key once, in the area of the table that holds it.
    expect(pages.get('users.md')).not.toContain('orders');
  });

  it('indexes the areas with tables in the order AREAS gives', () => {
    const { pages } = tablePages(schema, AREAS_OF, AREAS);

    expect([...pages.keys()]).toEqual([
      'README.md',
      'orders.md',
      'organizations.md',
      'users.md',
    ]);
    const index = pages.get('README.md') as string;
    expect(index).toContain(
      [
        '| [orders](orders.md) | `order_tags`, `orders` |',
        '| [organizations](organizations.md) | `organizations` |',
        '| [users](users.md) | `users` |',
      ].join('\n'),
    );
    expect(index).toContain('but\n  2: `organizations`, `users`.');
  });

  it('writes nothing while a table is in no area', () => {
    const { pages, failures } = tablePages(
      schema,
      { ...AREAS_OF, orders: ['orders'] },
      AREAS,
    );

    expect(failures).toEqual(['order_tags: in no area']);
    expect(pages.size).toBe(0);
  });

  it('refuses a table in two areas, a name no table has, and an area AREAS lacks', () => {
    const { pages, failures } = tablePages(
      schema,
      { ...AREAS_OF, users: ['users', 'orders', 'invoices'], billing: [] },
      AREAS,
    );

    expect(failures).toEqual([
      'orders: in two areas, orders and users',
      'invoices: no such table in the schema',
      'billing: not an area',
    ]);
    expect(pages.size).toBe(0);
  });
});
