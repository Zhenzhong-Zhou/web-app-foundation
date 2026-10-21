import { createIntl } from 'react-intl';
import { describe, expect, it } from 'vitest';

import { Permission } from '../api/types.gen';
import en from '../locales/en.json';
import zh from '../locales/zh-Hans.json';
import { accessAreas } from './access-phrases';

// Canadian English, whose lists have no comma before "and".
const intl = createIntl({ locale: 'en-CA', messages: en, defaultLocale: 'en' });

/** The server's Viewer and Admin (permissions.ts), as the session holds them. */
const VIEWER: Permission[] = [
  'users.view',
  'roles.view',
  'organizations.view',
  'products.view',
  'product_licences.view',
  'tax_codes.view',
  'invoices.view',
  'return_authorizations.view',
  'boms.view',
  'locations.view',
  'stock.view',
  'production.view',
  'partners.view',
  'orders.view',
];

const ADMIN: Permission[] = [
  ...VIEWER,
  'users.create',
  'users.delete',
  'roles.assign',
  'audit.view',
  'products.create',
  'products.update',
  'product_licences.create',
  'product_licences.update',
  'invoices.create',
  'invoices.update',
  'invoices.delete',
  'return_authorizations.create',
  'return_authorizations.update',
  'boms.create',
  'boms.update',
  'locations.create',
  'locations.update',
  'stock.move',
  'stock.adjust',
  'partners.create',
  'partners.update',
  'orders.create',
  'orders.update',
  'orders.receive',
  'orders.ship',
  'production.create',
  'production.release',
  'production.complete',
];

const sentences = (permissions: Permission[], on = intl) =>
  accessAreas(on, permissions).map(({ label, sentence }) => [label, sentence]);

/**
 * What you can do here (ADR-079), put together from the permissions held,
 * never from the role's name: a sentence per area touched, in the ADR's
 * order, and nothing for an area out of reach.
 */
describe('what you can do here', () => {
  it('says what a Viewer may see, area by area', () => {
    expect(sentences(VIEWER)).toEqual([
      [
        'Stock and locations',
        'See what is on hand, where stock is kept and each lot’s history.',
      ],
      [
        'Products and licences',
        'See the catalogue, recipes and product licences.',
      ],
      ['Orders', 'See purchase and sales orders.'],
      ['Production', 'See production runs and what they used.'],
      [
        'Invoices and returns',
        'See invoices, credit notes and return authorizations.',
      ],
      ['Costs, prices and tax', 'See tax codes and their rates.'],
      ['Partners', 'See customers and suppliers.'],
      [
        'People and the organization',
        'See who works here and the organization’s settings.',
      ],
    ]);
  });

  it('says what an Admin may do, and not also as seen what they may change', () => {
    expect(sentences(ADMIN)).toEqual([
      [
        'Stock and locations',
        'See what is on hand and each lot’s history, receive, ship and move stock, correct a count and add and change locations.',
      ],
      [
        'Products and licences',
        'Add and change products, recipes and product licences.',
      ],
      [
        'Orders',
        'See purchase and sales orders, raise orders, change, confirm and cancel orders, receive what was ordered and ship what was sold.',
      ],
      [
        'Production',
        'See production runs and what they used, plan runs, release runs and record what runs make.',
      ],
      [
        'Invoices and returns',
        'See invoices, credit notes and return authorizations, draft invoices, change drafts, delete drafts, authorize returns and cancel and close returns.',
      ],
      ['Costs, prices and tax', 'See tax codes and their rates.'],
      ['Partners', 'Add and change customers and suppliers.'],
      [
        'People and the organization',
        'See who works here, the organization’s settings and the audit log, invite members, remove members and change members’ roles.',
      ],
    ]);
  });

  it('adds without changing, or changes without adding, as held', () => {
    expect(sentences(['products.view', 'products.create'])).toEqual([
      ['Products and licences', 'Add products.'],
    ]);
    expect(sentences(['price_lists.view', 'price_lists.update'])).toEqual([
      ['Costs, prices and tax', 'Change price lists.'],
    ]);
    // Changing costs sets exchange rates too, so both are said as changed.
    expect(sentences(['costs.view', 'costs.update'])).toEqual([
      ['Costs, prices and tax', 'Change costs and exchange rates.'],
    ]);
  });

  it('leaves out every area out of reach', () => {
    expect(sentences(['stock.view'])).toEqual([
      ['Stock and locations', 'See what is on hand and each lot’s history.'],
    ]);
    expect(sentences([])).toEqual([]);
  });

  it('has words for every permission there is, each alone', () => {
    for (const permission of Object.values(Permission)) {
      const areas = accessAreas(intl, [permission]);
      expect(areas, permission).toHaveLength(1);
      expect(areas[0].sentence, permission).toMatch(/^\p{Lu}.+\.$/u);
    }
  });

  it('joins as Chinese joins a list, with its own full stop', () => {
    const chinese = createIntl({
      locale: 'zh-Hans',
      messages: zh,
      defaultLocale: 'en',
    });
    expect(sentences(VIEWER, chinese)[0]).toEqual([
      '库存和库位',
      '查看现有库存、库存存放的位置和每个批次的历史记录。',
    ]);
  });
});
