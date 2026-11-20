import type {
  HomeCard,
  HomeResponse,
  Movement,
  OrderLine,
  Role,
  RoleRef,
  Welcome,
} from '../api/types.gen';

/**
 * An order line for a client test, complete, with whatever the case is about
 * overridden. One builder, so a field added to OrderLine is added here once
 * rather than in every spec that builds a line (vitest does not type-check,
 * so a stale hand-built line would only fail in tsc).
 *
 * The SKU and description derive from the id, so two lines in one fixture
 * cannot silently share a SKU and make every row query ambiguous.
 */
export function orderLine(over: Partial<OrderLine> = {}): OrderLine {
  const id = over.id ?? 'line-1';

  return {
    id,
    variantId: 'variant-plain',
    sku: `WIDGET-${id.slice(-1)}`,
    description: `Widget ${id.slice(-1)}`,
    tracksLots: false,
    unitOfMeasure: 'each',
    quantityOrdered: '40.0000',
    quantityFulfilled: '0.0000',
    quantityOutstanding: '40.0000',
    quantityReturned: '0.0000',
    quantityCredited: '0.0000',
    quantityUnsettled: '0.0000',
    unitPrice: null,
    currency: null,
    priceSource: null,
    priceListId: null,
    priceListName: null,
    lineTotal: null,
    isComplete: false,
    isClosedShort: false,
    closedReason: null,
    ...over,
  };
}

/**
 * A movement as GET /v1/stock/movements lists it (#282): 王建国 shipping 24
 * of 维生素 D (60 粒), VITD-60, from Shelf A in the Main warehouse, lot
 * NN-2410-07, with whatever the case is about overridden. One builder for
 * every spec that lists a movement, so a field the API adds to a movement
 * is added here once.
 */
export function movement(over: Partial<Movement> = {}): Movement {
  return {
    id: 'movement-1',
    variantId: 'variant-vitd-60',
    productId: 'product-vitd',
    sku: 'VITD-60',
    currentSku: 'VITD-60',
    productName: '维生素 D',
    variantName: '60 粒',
    type: 'good',
    unitOfMeasure: 'each',
    quantity: '24.0000',
    reason: 'shipment',
    reasonDetail: null,
    note: null,
    fromLocationId: 'location-shelf-a',
    fromLocationName: 'Shelf A',
    fromLocationCode: 'A',
    fromLocationPath: ['Main warehouse'],
    toLocationId: null,
    toLocationName: null,
    toLocationCode: null,
    toLocationPath: [],
    lotId: 'lot-nn-2410-07',
    lotCode: 'NN-2410-07',
    lotExpiresAt: '2027-10-31',
    actorName: '王建国',
    actorEmail: 'wang@example.com',
    createdAt: '2026-10-30T17:00:00.000Z',
    document: null,
    ...over,
  };
}

/**
 * A tile of Home as GET /home gives it (ADR-091): To ship, shown, with
 * nothing counted, and whatever the case is about overridden. One builder,
 * so a field the API adds to a tile is added here once.
 */
export function homeCard(over: Partial<HomeCard> = {}): HomeCard {
  return {
    kind: 'toShip',
    hidden: false,
    count: 0,
    late: 0,
    anyPoint: null,
    ...over,
  };
}

/** Getting started with every step done: Home leads with the cards. */
export const GETTING_STARTED_DONE: HomeResponse['gettingStarted'] = {
  steps: {
    organization: true,
    location: true,
    product: true,
    partner: true,
    receipt: true,
    invoice: true,
    team: true,
  },
  teamSkipped: false,
  dismissed: false,
  complete: true,
};

/**
 * A welcome on Home (ADR-079): Wang Fang, a Viewer who joined on 20
 * October, invited by Mei Lin with a note, three items open.
 */
export function welcome(over: Partial<Welcome> = {}): Welcome {
  return {
    joinedOn: '2026-10-20',
    lastDay: '2026-11-03',
    founder: false,
    inviter: { id: 'user-mei', name: 'Mei Lin', photoFileId: null },
    note: 'Welcome, Wang Fang!\nOn Monday you’ll shadow Li Na.',
    access: {
      roles: [{ name: 'Viewer', description: null }],
      holdsEverything: false,
      whomToAsk: [
        { id: 'user-mei', name: 'Mei Lin' },
        { id: 'user-david', name: 'David Park' },
      ],
    },
    items: [
      { key: 'sayWhoYouAre', done: false, what: null },
      { key: 'lookUp', done: false, what: null },
      { key: 'openOrder', done: false, what: null },
    ],
    ...over,
  };
}

/** A built-in role as GET /roles lists it (ADR-080), the reader able to give it. */
export function builtInRole(
  name: 'Owner' | 'Admin' | 'Viewer',
  over: Partial<Role> = {},
): Role {
  return {
    id: `role-${name.toLowerCase()}`,
    name,
    description: null,
    builtIn: true,
    permissions: [],
    holderCount: 0,
    mayGive: true,
    ...over,
  };
}

/** The same role beside a member or an invitation. */
export function roleRef(name: 'Owner' | 'Admin' | 'Viewer'): RoleRef {
  return { id: `role-${name.toLowerCase()}`, name, builtIn: true };
}
