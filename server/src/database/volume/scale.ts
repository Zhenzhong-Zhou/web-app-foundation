export const SCALES = ['small', 'large'] as const;

export type Scale = (typeof SCALES)[number];

/** The year the seed writes, a week at a time. */
export const WEEKS = 52;

/**
 * What one organization holds after a year, per scale (ADR-051).
 *
 * Counts are targets for what gets created; the stock movements follow from
 * them rather than being set directly, since every movement comes from a
 * receipt, a putaway, a shipment, a run, a count or a sample. The seed
 * prints what it actually wrote, and that is what a report compares.
 */
export interface Volume {
  products: number;
  /** Shares of the catalogue; whatever is left is goods. */
  materialShare: number;
  packagingShare: number;
  /** Of goods, how many are lot-tracked. Materials always are. */
  trackedGoodsShare: number;

  suppliers: number;
  customers: number;

  /** Bins under the one site: raw materials apart from finished goods. */
  materialBins: number;
  goodsBins: number;

  /** Active recipes, each making one lot-tracked good from materials. */
  recipes: number;

  purchaseOrders: number;
  saleOrders: number;
  productionRuns: number;
  /** Cycle-count corrections, in and out. */
  adjustments: number;
  /** Hand-outs to a customer, recorded so a recall finds them (ADR-042). */
  samples: number;

  /** Of sales that ship, how many go in two parts a week apart. */
  splitShare: number;
  /** Of shipments, how many are invoiced. */
  invoiceShare: number;
  /** Of issued invoices, how many get a credit with no goods back. */
  creditShare: number;
  /** Of issued invoices, how many get an RMA, a return and its credit. */
  rmaShare: number;
  /** Orders left as drafts, and confirmed ones left open, at year end. */
  draftShare: number;
  openShare: number;
}

const SMALL: Volume = {
  products: 500,
  materialShare: 0.15,
  packagingShare: 0.1,
  trackedGoodsShare: 0.34,

  suppliers: 60,
  customers: 240,

  materialBins: 4,
  goodsBins: 20,

  recipes: 25,

  purchaseOrders: 1_500,
  saleOrders: 3_500,
  productionRuns: 100,
  adjustments: 5_000,
  samples: 300,

  splitShare: 0.8,
  invoiceShare: 0.35,
  creditShare: 0.075,
  rmaShare: 0.025,
  draftShare: 0.03,
  openShare: 0.05,
};

/**
 * Ten times small in everything that is a count. Shares stay the same: a
 * larger customer is more of the same business, not a different one. Bins
 * grow five times, since a warehouse grows by aisles rather than by tenfold.
 */
const LARGE: Volume = {
  ...SMALL,
  products: 5_000,
  suppliers: 600,
  customers: 2_400,
  materialBins: 20,
  goodsBins: 100,
  recipes: 250,
  purchaseOrders: 15_000,
  saleOrders: 35_000,
  productionRuns: 1_000,
  adjustments: 50_000,
  samples: 3_000,
};

export const VOLUMES: Record<Scale, Volume> = { small: SMALL, large: LARGE };

/** Spreads a yearly total over the weeks so the year adds up exactly. */
export function inWeek(total: number, week: number): number {
  return (
    Math.floor((total * (week + 1)) / WEEKS) -
    Math.floor((total * week) / WEEKS)
  );
}
