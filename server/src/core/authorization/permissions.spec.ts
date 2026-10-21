import { SUPPORTED_LOCALES } from '../../common/locales';
import english from '../../i18n/en.json';
import french from '../../i18n/fr-CA.json';
import type { Translatable } from '../../i18n/translate';
import chinese from '../../i18n/zh-Hans.json';
import {
  ALL_PERMISSIONS,
  LOCKED_PERMISSIONS,
  NEVER_OFFERED,
  type Permission,
  PERMISSION_DESCRIPTIONS,
  PERMISSION_NEEDS,
  PERMISSION_NOTES,
  ROLE_TEMPLATES,
  SYSTEM_ROLE_PERMISSIONS,
} from './permissions';

const CATALOGUES: Record<string, Record<string, string>> = {
  en: english,
  'fr-CA': french,
  'zh-Hans': chinese,
};

/** Each permission held whose needs are not all held, with what it lacks. */
function unmet(held: readonly Permission[]): string[] {
  const holding = new Set(held);
  return held.flatMap((permission) =>
    (PERMISSION_NEEDS[permission] ?? [])
      .filter((need) => !holding.has(need))
      .map((need) => `${permission} needs ${need}`),
  );
}

const ROLES: [string, readonly Permission[]][] = [
  ...Object.entries(SYSTEM_ROLE_PERMISSIONS),
  ...Object.entries(ROLE_TEMPLATES).map(
    ([key, template]): [string, readonly Permission[]] => [
      key,
      template.permissions,
    ],
  ),
];

/**
 * The vocabulary job roles are made from (ADR-080): each permission's
 * words, what it needs, what every role holds and what none may, and the
 * templates a role starts from.
 */
describe('permissions', () => {
  it('has 58, each once', () => {
    expect(ALL_PERMISSIONS).toHaveLength(58);
    expect(new Set(ALL_PERMISSIONS).size).toBe(58);
  });

  describe('their words', () => {
    const words: [string, Translatable][] = [
      ...Object.entries(PERMISSION_DESCRIPTIONS),
      ...Object.entries(PERMISSION_NOTES),
      ...Object.entries(ROLE_TEMPLATES).map(
        ([key, template]): [string, Translatable] => [key, template.name],
      ),
    ];

    it.each(SUPPORTED_LOCALES)(
      'gives every permission its line, every note and template its words, in %s',
      (locale) => {
        for (const [key, message] of words) {
          const said = CATALOGUES[locale][message.messageId];
          expect(said, `${key} in ${locale}`).toBeTruthy();
          // A translation, not the English left behind; Production is the
          // same word in French.
          if (locale !== 'en' && message.message !== 'Production') {
            expect(said, `${key} in ${locale}`).not.toBe(message.message);
          }
        }
      },
    );

    it('gives each permission a line of its own', () => {
      const ids = ALL_PERMISSIONS.map(
        (permission) => PERMISSION_DESCRIPTIONS[permission].messageId,
      );
      expect(new Set(ids).size).toBe(ALL_PERMISSIONS.length);
    });
  });

  describe('what each needs', () => {
    it('has no cycle', () => {
      const done = new Set<Permission>();
      const cycle = (permission: Permission, path: Permission[]): string[] => {
        if (path.includes(permission)) {
          return [[...path, permission].join(' → ')];
        }
        if (done.has(permission)) return [];
        const found = (PERMISSION_NEEDS[permission] ?? []).flatMap((need) =>
          cycle(need, [...path, permission]),
        );
        done.add(permission);
        return found;
      };

      expect(ALL_PERMISSIONS.flatMap((p) => cycle(p, []))).toEqual([]);
    });

    it('gives nothing offered a need that is not', () => {
      // A made role could never hold it.
      const offered = ALL_PERMISSIONS.filter((p) => !NEVER_OFFERED.includes(p));
      for (const permission of offered) {
        for (const need of PERMISSION_NEEDS[permission] ?? []) {
          expect(NEVER_OFFERED, `${permission} needs ${need}`).not.toContain(
            need,
          );
        }
      }
    });

    it('is met by every built-in role and every template', () => {
      for (const [role, held] of ROLES) {
        expect(unmet(held), role).toEqual([]);
      }
    });

    it('holds prices on orders to seeing orders, and setting them to the prices', () => {
      expect(PERMISSION_NEEDS['orders.view_prices']).toEqual(['orders.view']);
      expect(PERMISSION_NEEDS['orders.create']).toContain('orders.view_prices');
      expect(PERMISSION_NEEDS['orders.update']).toContain('orders.view_prices');
    });

    it('gives every change and every act a need, a view needing nothing', () => {
      for (const permission of ALL_PERMISSIONS) {
        const needs = PERMISSION_NEEDS[permission] ?? [];
        if (permission.endsWith('.view')) {
          expect(needs, permission).toEqual([]);
        } else {
          expect(needs.length, permission).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('roles', () => {
    it('locks seeing who works here, the roles and the settings into every built-in role and template', () => {
      for (const [role, held] of ROLES) {
        for (const locked of LOCKED_PERMISSIONS) {
          expect(held, role).toContain(locked);
        }
      }
    });

    it('offers no template anything that stays the Owners’', () => {
      for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
        for (const kept of NEVER_OFFERED) {
          expect(template.permissions, key).not.toContain(kept);
        }
      }
    });

    it('lists no permission twice in a template', () => {
      for (const [key, template] of Object.entries(ROLE_TEMPLATES)) {
        expect(new Set(template.permissions).size, key).toBe(
          template.permissions.length,
        );
      }
    });

    it('keeps prices on orders from Warehouse, Production and Stock look-up', () => {
      for (const key of ['warehouse', 'production', 'stock_lookup'] as const) {
        expect(ROLE_TEMPLATES[key].permissions, key).not.toContain(
          'orders.view_prices',
        );
      }
    });

    /**
     * What Admin and Viewer held before ADR-080, and prices on orders, split
     * from orders.view, which they held: nothing changes for either.
     */
    it('leaves Admin and Viewer granting what they did', () => {
      const viewer: Permission[] = [
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
      const admin: Permission[] = [
        ...viewer,
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

      expect([...SYSTEM_ROLE_PERMISSIONS.Viewer].sort()).toEqual(
        [...viewer, 'orders.view_prices'].sort(),
      );
      expect([...SYSTEM_ROLE_PERMISSIONS.Admin].sort()).toEqual(
        [...admin, 'orders.view_prices'].sort(),
      );
    });

    it('gives the Owner everything', () => {
      expect(SYSTEM_ROLE_PERMISSIONS.Owner).toEqual(ALL_PERMISSIONS);
    });
  });
});
