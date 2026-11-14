import {
  isPluralElement,
  isSelectElement,
  isTagElement,
  type MessageFormatElement,
  parse,
} from '@formatjs/icu-messageformat-parser';
import { describe, expect, it } from 'vitest';

import { type Locale, SUPPORTED_LOCALES } from '../lib/locales';
import en from '../locales/en.json';
import fr from '../locales/fr-CA.json';
import zh from '../locales/zh-Hans.json';

/**
 * Labels a screen shows together, as a set to choose from or one at a
 * time in the same place: a status set, a filter's choices, a select's
 * options. Two of one group worded the same leave a reader unable to tell
 * them apart, as French round 2 gave a closed run and a completed one
 * both terminé (ADR-054's November 2026 amendment). Each group by its
 * messages' ids; a label that is data, such as a location's or a tax
 * code's name, is not one.
 */
const GROUPS: { shown: string; ids: string[] }[] = [
  {
    shown: "Orders' statuses",
    ids: [
      'orders.status.draft',
      'orders.status.confirmed',
      'orders.status.shipped',
      'orders.status.received',
      'orders.status.cancelled',
    ],
  },
  {
    shown: "Runs' statuses, and the runs' filter",
    ids: [
      'production.status.draft',
      'production.status.released',
      'production.status.completed',
      'orders.status.cancelled',
      'invoices.filter.all',
    ],
  },
  {
    shown: "Invoices' statuses",
    ids: [
      'orders.status.draft',
      'invoices.status.issued',
      'orders.shipments.voided',
    ],
  },
  {
    shown: "Returns' statuses, and their filter",
    ids: [
      'rmas.status.open',
      'rmas.status.closed',
      'orders.status.cancelled',
      'invoices.filter.all',
    ],
  },
  {
    shown: "Licences' statuses",
    ids: [
      'licences.status.withdrawn',
      'licences.status.inForceFrom',
      'licences.status.current',
      'licences.status.expired',
      'licences.status.expiresToday',
      'licences.status.expiresIn',
    ],
  },
  {
    shown: 'A licence at release',
    ids: [
      'licences.atRelease.current',
      'licences.atRelease.expired',
      'licences.atRelease.notInForce',
      'licences.atRelease.none',
      'licences.atRelease.unrecorded',
    ],
  },
  {
    shown: "Recipe versions' statuses",
    ids: ['boms.status.draft', 'boms.status.active', 'boms.status.archived'],
  },
  {
    shown: "An item's row",
    ids: [
      'products.discontinued',
      'inventory.reorder.filter.out',
      'inventory.reorder.filter.low',
    ],
  },
  {
    shown: "Invitations' links",
    ids: [
      'members.invited.emailed',
      'members.invited.copied',
      'members.invited.notSent',
      'members.invited.ended',
    ],
  },
  {
    shown: "A partner's addresses",
    ids: [
      'partners.address.default',
      'partners.address.billing',
      'partners.address.shipping',
      'common.retired',
    ],
  },
  {
    shown: "A location's row",
    ids: ['locations.holdsStock', 'locations.notAvailable', 'common.retired'],
  },
  {
    shown: "A tax code's chip",
    ids: ['locations.edit.inUse', 'common.retired'],
  },
  {
    shown: "A credit note's chip",
    ids: ['invoices.creditNote.voids', 'invoices.creditNote.credits'],
  },
  {
    shown: "A role's kind",
    ids: ['roles.kind.builtIn', 'roles.kind.made'],
  },
  {
    shown: 'The built-in roles',
    ids: ['members.role.owner', 'members.role.admin', 'members.role.viewer'],
  },
  {
    shown: "A supplier's chip",
    ids: ['production.manufacturer', 'production.us'],
  },
  {
    shown: "An order line's chip",
    ids: ['orders.lines.closedShort', 'orders.lines.short'],
  },
  {
    shown: "A partner's status",
    ids: ['common.active', 'common.retired'],
  },
  {
    shown: "Orders' quick filters",
    ids: [
      'orders.filter.open',
      'orders.filter.fulfilled',
      'orders.filter.cancelled',
      'orders.filter.all',
    ],
  },
  {
    shown: "Orders' direction chips",
    ids: ['orders.filter.sales', 'orders.filter.purchases'],
  },
  {
    shown: "Orders' late chips",
    ids: [
      'orders.filter.toShip',
      'orders.filter.toReceive',
      'orders.filter.outstanding',
    ],
  },
  {
    shown: "Invoices' filters",
    ids: [
      'invoices.filter.all',
      'invoices.filter.toIssue',
      'invoices.status.issued',
      'orders.shipments.voided',
    ],
  },
  {
    shown: "Reorder points' filters",
    ids: [
      'inventory.reorder.filter.all',
      'inventory.reorder.filter.low',
      'inventory.reorder.filter.out',
    ],
  },
  {
    shown: "Inventory's quick filters",
    ids: [
      'inventory.quick.expiring',
      'inventory.quick.needsCost',
      'inventory.showEmptied',
    ],
  },
  {
    shown: "Licences' filters",
    ids: ['licences.filter.expiring', 'licences.filter.expired'],
  },
  {
    shown: "Items' sort on a phone",
    ids: [
      'products.sort.name',
      'products.category',
      'products.sort.stock',
      'products.sort.changed',
      'products.sort.added',
    ],
  },
  {
    shown: "A date range's Period",
    ids: [
      'filters.range.thisMonth',
      'filters.range.lastMonth',
      'filters.range.thisQuarter',
      'filters.range.thisYear',
      'filters.range.any',
    ],
  },
  {
    shown: "Movements' reasons",
    ids: [
      'inventory.movements.anyReason',
      'inventory.reason.receipt',
      'inventory.reason.shipment',
      'inventory.reason.transfer',
      'inventory.reason.adjustment',
      'inventory.reason.production',
      'inventory.reason.consumption',
      'inventory.reason.sample',
      'inventory.reason.return',
    ],
  },
  {
    shown: 'Colour mode',
    ids: [
      'components.colorMode.system',
      'components.colorMode.light',
      'components.colorMode.dark',
    ],
  },
  {
    shown: 'Text size',
    ids: [
      'components.textSize.standard',
      'components.textSize.large',
      'components.textSize.larger',
    ],
  },
  {
    shown: 'Idle sign-out',
    ids: [
      'settings.security.off',
      'settings.security.minutes',
      'settings.security.hours',
    ],
  },
  {
    shown: 'Whom idle sign-out applies to',
    ids: ['settings.security.unticked', 'settings.security.everyone'],
  },
  {
    shown: "Branding's colours",
    ids: [
      'settings.branding.preset.indigo',
      'settings.branding.preset.blue',
      'settings.branding.preset.teal',
      'settings.branding.preset.greenSlate',
      'settings.branding.preset.plum',
      'settings.branding.preset.charcoal',
      'settings.branding.custom',
    ],
  },
  {
    shown: "Branding's sidebar",
    ids: ['settings.branding.sidebar.dark', 'settings.branding.sidebar.light'],
  },
  {
    shown: "Numbering's Starts again",
    ids: [
      'settings.numbering.reset.never',
      'settings.numbering.reset.yearly',
      'settings.numbering.reset.monthly',
      'settings.numbering.reset.daily',
    ],
  },
  {
    shown: 'Paper size',
    ids: [
      'settings.org.paper.automatic',
      'settings.org.paper.letter',
      'settings.org.paper.a4',
    ],
  },
  {
    shown: 'The licence policy',
    ids: [
      'settings.org.policy.block',
      'settings.org.policy.override',
      'settings.org.policy.allow',
    ],
  },
  {
    shown: "An order's direction",
    ids: ['orders.direction.selling', 'orders.direction.buying'],
  },
  {
    shown: "One item's type",
    ids: [
      'products.type.good.one',
      'products.type.material.one',
      'products.type.packaging.one',
      'products.type.supply.one',
      'products.type.sample.one',
      'products.type.equipment.one',
    ],
  },
  {
    shown: "Items' tabs",
    ids: [
      'products.type.good',
      'products.type.material',
      'products.type.packaging',
      'products.type.supply',
      'products.type.sample',
      'products.type.equipment',
      'products.tab.all',
    ],
  },
  {
    shown: 'Units',
    ids: [
      'products.unit.each',
      'products.unit.kg',
      'products.unit.g',
      'products.unit.litre',
      'products.unit.ml',
      'products.unit.case',
      'products.unit.box',
      'products.unit.pallet',
    ],
  },
  {
    shown: 'Location types',
    ids: [
      'locations.type.site',
      'locations.type.zone',
      'locations.type.aisle',
      'locations.type.shelf',
      'locations.type.bin',
    ],
  },
  {
    shown: "A reorder point's source",
    ids: ['inventory.reorder.bought', 'inventory.reorder.made'],
  },
  {
    shown: "A reorder point's rule",
    ids: [
      'inventory.reorder.rule.justEnough',
      'inventory.reorder.rule.fixed',
      'inventory.reorder.rule.maximum',
    ],
  },
  {
    shown: 'A stock correction',
    ids: ['inventory.move.less', 'inventory.move.more'],
  },
  {
    shown: "A stock correction's why",
    ids: [
      'inventory.detail.miscount',
      'inventory.detail.damaged',
      'inventory.detail.expired',
      'inventory.detail.lost',
      'inventory.detail.found',
    ],
  },
  {
    shown: 'Return reasons',
    ids: [
      'orders.returnReason.damaged',
      'orders.returnReason.wrongItem',
      'orders.returnReason.notWanted',
      'orders.returnReason.expired',
      'orders.returnReason.qualityConcern',
      'orders.returnReason.other',
    ],
  },
  {
    shown: "A return's resolution",
    ids: [
      'rmas.resolution.credit',
      'rmas.resolution.replace',
      'rmas.resolution.none',
    ],
  },
  {
    shown: "A price list's side",
    ids: ['priceLists.side.saleLong', 'priceLists.side.purchaseLong'],
  },
  {
    shown: "A price list's side, short",
    ids: ['priceLists.side.sale', 'priceLists.side.purchase'],
  },
  {
    shown: "A role's Start from",
    ids: [
      'roles.start.warehouse',
      'roles.start.sales',
      'roles.start.finance',
      'roles.start.production',
      'roles.start.stockLookup',
      'roles.start.copy',
      'roles.start.nothing.line',
    ],
  },
];

/** A select inside one message, by its id and argument: its options likewise. */
const SELECTS: { id: string; argument: string }[] = [
  { id: 'inventory.reorder.status', argument: 'status' },
  { id: 'inventory.reorder.kind', argument: 'source' },
  { id: 'inventory.reorder.kind', argument: 'rule' },
  { id: 'inventory.reorder.ruleLine', argument: 'rule' },
  { id: 'settings.numbering.format', argument: 'reset' },
];

const CATALOGUES: Record<Locale, Record<string, string>> = {
  en,
  'fr-CA': fr,
  'zh-Hans': zh,
};

/** Each option of the select by that argument, as written, by its key. */
type Options = (readonly [string, string])[];

function optionsOf(
  elements: MessageFormatElement[],
  argument: string,
): Options | null {
  for (const element of elements) {
    if (isSelectElement(element) || isPluralElement(element)) {
      if (isSelectElement(element) && element.value === argument) {
        return Object.entries(element.options).map(
          ([key, option]) =>
            [
              key,
              JSON.stringify(option.value, (name, value: unknown) =>
                name === 'location' ? undefined : value,
              ),
            ] as const,
        );
      }
      for (const option of Object.values(element.options)) {
        const found = optionsOf(option.value, argument);
        if (found) return found;
      }
    }
    if (isTagElement(element)) {
      const found = optionsOf(element.children, argument);
      if (found) return found;
    }
  }
  return null;
}

/** The ids, or keys, worded alike: each pair after the first of a wording. */
function alike(entries: Options) {
  const first = new Map<string, string>();
  return entries.flatMap(([id, text]) => {
    const earlier = first.get(text);
    if (earlier === undefined) first.set(text, id);
    return earlier === undefined ? [] : [`${earlier} and ${id}: ${text}`];
  });
}

describe('labels shown together', () => {
  it('name messages that exist', () => {
    const ids = [
      ...GROUPS.flatMap((group) => group.ids),
      ...SELECTS.map((select) => select.id),
    ];
    expect(ids.filter((id) => !(id in en))).toEqual([]);
  });

  it.each(SUPPORTED_LOCALES)('differ from each other in %s', (locale) => {
    const catalogue = CATALOGUES[locale];
    const same = GROUPS.flatMap((group) =>
      alike(group.ids.map((id) => [id, catalogue[id] ?? ''] as const)).map(
        (pair) => `${group.shown}: ${pair}`,
      ),
    );
    expect(same).toEqual([]);
  });

  it.each(SUPPORTED_LOCALES)(
    "differ in a select's options inside one message, in %s",
    (locale) => {
      const same = SELECTS.flatMap(({ id, argument }) => {
        const options = optionsOf(parse(CATALOGUES[locale][id]), argument);
        expect(options, `${id}'s ${argument}`).not.toBeNull();
        return alike(options ?? []).map(
          (pair) => `${id}'s ${argument}: ${pair}`,
        );
      });
      expect(same).toEqual([]);
    },
  );
});
