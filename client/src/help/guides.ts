import { defineMessages, type MessageDescriptor } from 'react-intl';
import { matchPath } from 'react-router-dom';

import { NAV_LABELS } from '../layout/navigation';
import type { Locale } from '../lib/locales';
import { loadChunk } from '../version/load-chunk';

export interface Guide {
  /** The routes it explains, written as the route list writes them. */
  routes: readonly string[];
  /** Its name in the list at Help's foot. */
  label: MessageDescriptor;
  /**
   * The sections a Learn more elsewhere opens. Each exists in every
   * language of the guide, which the check proves.
   */
  sections: readonly string[];
}

const labels = defineMessages({
  lots: { id: 'help.guide.lots', defaultMessage: 'Lots' },
  licences: { id: 'help.guide.licences', defaultMessage: 'Licences' },
});

/**
 * One guide per area (ADR-079), each a Markdown file per language in
 * `guides/<language>/<guide>.md`, and the routes it explains. Every
 * signed-in route is in exactly one guide's list, which the check
 * (guides.test.ts) proves against the route list App.tsx renders.
 */
export const GUIDES = {
  home: {
    routes: ['/'],
    label: NAV_LABELS.home,
    sections: ['getting-started'],
  },
  account: {
    routes: ['/account', '/account/sessions', '/account/activity'],
    label: NAV_LABELS.account,
    sections: ['your-access'],
  },
  people: {
    routes: ['/people', '/people/:userId'],
    label: NAV_LABELS.people,
    sections: [],
  },
  members: {
    routes: ['/members'],
    label: NAV_LABELS.members,
    sections: ['invite'],
  },
  roles: {
    routes: [
      '/settings/roles',
      '/settings/roles/new',
      '/settings/roles/:id',
      '/settings/roles/:id/edit',
    ],
    label: NAV_LABELS.roles,
    sections: [],
  },
  'audit-log': {
    routes: ['/audit'],
    label: NAV_LABELS.auditLog,
    sections: [],
  },
  organization: {
    routes: ['/settings/organization'],
    label: NAV_LABELS.organization,
    sections: ['profile', 'numbering', 'licences', 'idle-sign-out'],
  },
  'tax-codes': {
    routes: ['/settings/tax-codes'],
    label: NAV_LABELS.taxCodes,
    sections: ['add'],
  },
  'exchange-rates': {
    routes: ['/settings/exchange-rates'],
    label: NAV_LABELS.exchangeRates,
    sections: ['add'],
  },
  'price-lists': {
    routes: ['/settings/price-lists', '/settings/price-lists/:id'],
    label: NAV_LABELS.priceLists,
    sections: ['add', 'prices'],
  },
  'stock-value': {
    routes: ['/costs'],
    label: NAV_LABELS.stockValue,
    sections: ['costs'],
  },
  products: {
    routes: ['/products', '/products/:id'],
    label: NAV_LABELS.products,
    sections: ['add'],
  },
  licences: {
    routes: ['/licences'],
    label: labels.licences,
    sections: ['add'],
  },
  inventory: {
    routes: ['/inventory'],
    label: NAV_LABELS.inventory,
    sections: ['receive'],
  },
  movements: {
    routes: ['/movements'],
    label: NAV_LABELS.movements,
    sections: [],
  },
  lots: {
    routes: ['/lots', '/lots/:id'],
    label: labels.lots,
    sections: ['trace'],
  },
  locations: {
    routes: ['/locations'],
    label: NAV_LABELS.locations,
    sections: ['add'],
  },
  partners: {
    routes: ['/partners', '/partners/:id'],
    label: NAV_LABELS.partners,
    sections: ['add'],
  },
  orders: {
    routes: ['/orders', '/orders/new', '/orders/:id'],
    label: NAV_LABELS.orders,
    sections: ['raise', 'ship'],
  },
  invoices: {
    routes: [
      '/invoices',
      '/invoices/:id',
      '/credit-notes',
      '/credit-notes/:id',
    ],
    label: NAV_LABELS.invoices,
    sections: ['issue', 'credit'],
  },
  returns: {
    routes: ['/return-authorizations', '/return-authorizations/:id'],
    label: NAV_LABELS.returns,
    sections: ['authorize'],
  },
  production: {
    routes: ['/production', '/production/:id'],
    label: NAV_LABELS.production,
    sections: ['plan'],
  },
} as const satisfies Record<string, Guide>;

export type GuideName = keyof typeof GUIDES;

export const GUIDE_NAMES = Object.keys(GUIDES) as GuideName[];

/**
 * Where a Learn more opens Help: a guide, and one of the sections its entry
 * above lists, so naming one that is not there does not compile.
 */
export type LearnMoreTarget = {
  [G in GuideName]: {
    guide: G;
    section: (typeof GUIDES)[G]['sections'][number];
  };
}[GuideName];

/** The guide for a page of the app, or null for an address that is none. */
export function guideFor(pathname: string): GuideName | null {
  return (
    GUIDE_NAMES.find((name) =>
      GUIDES[name].routes.some((route) => matchPath(route, pathname)),
    ) ?? null
  );
}

/**
 * Each guide in each language, as its own chunk, fetched when Help shows
 * it: no page downloads them (ADR-079).
 */
const FILES = import.meta.glob<string>('./guides/*/*.md', {
  query: '?raw',
  import: 'default',
});

/**
 * A guide in the reader's language, or in English if that file is missing,
 * loaded as every chunk is (loadChunk, ADR-081).
 */
export function loadGuide(guide: GuideName, locale: Locale): Promise<string> {
  const load =
    FILES[`./guides/${locale}/${guide}.md`] ?? FILES[`./guides/en/${guide}.md`];
  return loadChunk(load);
}
