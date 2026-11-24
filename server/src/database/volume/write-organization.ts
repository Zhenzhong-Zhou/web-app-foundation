import type { LoggerService } from '@nestjs/common';

import type { LotExpiry, ProductType } from '../schema';
import type { Random } from './random';
import { inWeek, type Volume, WEEKS } from './scale';
import type { Services } from './services';
import {
  CATEGORY_COUNT,
  type Kind,
  typeAt,
  writeCategories,
} from './write-categories';
import { writeReorderPoints } from './write-reorder-points';

/** The handles perf and the plan check need, recorded in the manifest. */
export interface Anchors {
  customerId: string;
  supplierId: string;
  dockLocationId: string;
  taxCodeId: string;
  /** A batch made from ingredient lots: a trace with both sides filled. */
  traceLotId: string | null;
}

/**
 * One catalogue item and the seed's own count of it.
 *
 * Whole units only, so plain numbers are exact here. This is the seed's
 * bookkeeping for choosing what can be sold, never a quantity the app reads
 * back: every quantity sent is a string, as the API takes it (ADR-025).
 */
interface Item {
  productId: string;
  variantId: string;
  tracked: boolean;
  kind: Kind;
  /** A good may be equipment, which never tracks lots (ADR-092). */
  type: ProductType;
  homeBinId: string;
  /** Cents, so a price is formatted without a float. */
  priceCents: number;
  /** In its home bin, what the seed's sales, runs and counts draw on. */
  onHand: number;
  /** Held for confirmed sales not yet shipped (ADR-045). */
  committed: number;
  /**
   * Put away in other bins (ADR-093, R18): on hand all the same, but never
   * drawn on here, so a sale ships only what its home bin holds.
   */
  elsewhere: number;
  /**
   * In lots expired already (ADR-093, 32a): on hand, but never drawn on,
   * since no sale may hold it.
   */
  expired: number;
  /** Receipts so far, which decide by position which are put away apart. */
  receipts: number;
  /**
   * The lot its last receipt went into, which a later lot change may move
   * stock into (ADR-094): another of the item's lots, never a new one.
   */
  lastLotId: string | null;
}

interface Recipe {
  bomId: string;
  output: Item;
  outputQuantity: number;
  components: { item: Item; quantity: number }[];
}

interface Part {
  lineId: string;
  item: Item;
  quantity: number;
}

interface PendingShipment {
  orderId: string;
  binId: string;
  parts: Part[];
}

/**
 * Each word with its Chinese, picked together, so a good named in Chinese
 * reads as a Chinese name, 专注日常胶囊 60 粒, which its pinyin and any one
 * of its characters find (ADR-056). As many entries as before, so the
 * random source picks the same words.
 */
const GOOD_NAMES = [
  ['Focus', '专注'],
  ['Calm', '舒缓'],
  ['Immune', '免疫'],
  ['Sleep', '安眠'],
  ['Energy', '活力'],
  ['Joint', '关节'],
] as const;
const GOOD_FORMS = [
  ['Daily', '日常'],
  ['Forte', '强效'],
  ['Complex', '复合'],
  ['Support', '养护'],
  ['Formula', '配方'],
  ['Max', '加强'],
] as const;
const COUNTS = [30, 60, 90, 120];
const MATERIALS = [
  'Ashwagandha',
  'Turmeric',
  'Ginger',
  'Magnesium',
  'Zinc',
  'Elderberry',
  'Echinacea',
  'Rhodiola',
];
/** What a supply or a piece of equipment is called, by its position. */
const SUPPLIES = [
  'Nitrile gloves, box of 100',
  'Hairnets, pack of 500',
  'Cleaning wipes, tub of 200',
  'Packing tape, 6 rolls',
];
const EQUIPMENT = [
  'Capsule filling machine',
  'Bottle labeller',
  'Platform scale',
  'Induction sealer',
];
const PARTNER_WORDS = [
  ['Cascade', '清泉'],
  ['Harbour', '港湾'],
  ['Northside', '北岸'],
  ['Pacific', '太平洋'],
  ['Summit', '高峰'],
] as const;
const PARTNER_KINDS = [
  ['Botanicals', '草本'],
  ['Pharmacy', '药房'],
  ['Health', '健康'],
  ['Naturals', '天然'],
] as const;

/**
 * One receipt in this many is put away in two bins, a third of it in a
 * second one, so a code is in several places and a lot in two (ADR-093,
 * R18). By position, never from the random source, so the rest of the year
 * is the year it was.
 */
const APART_EVERY = 6;

/**
 * Every this many lots expires within the year after the seed's day, and
 * every `PAST_EVERY`th has expired already (ADR-093, 32a), so Expiring
 * soon and Expired have rows whenever the volume is read in that year,
 * GitHub's cached one included. By position, never from the random
 * source: the rest of the year is the year it was.
 */
const WITHIN_YEAR_EVERY = 5;
const PAST_EVERY = 100;

/**
 * A step through the year's days, prime to 365, so the dated lots spread
 * evenly over it however few there are. From the second day after the
 * seed's: an organization ahead of UTC may already be on the next.
 */
const DAY_STRIDE = 53;

/**
 * Lots as ADR-094 makes them (R23), each by position and never from the
 * random source, so the rest of the year is the year it was:
 *
 * - one received lot in `MADE_HERE_EVERY`, from its third, has a code the
 *   lot series made, and every second of those carries a supplier's lot,
 *   `SUP-nnnnnn`: the app lets only a code made here carry one (R5), so
 *   they are one lot in 40, and the other made codes read "Supplier's lot
 *   to add";
 * - one in `EXPIRY_NOT_KNOWN_EVERY`, from its eleventh, has an expiry not
 *   known yet, read "Expiry to add";
 * - one purchase line of a tracked good in `WAITING_EVERY` is bought with
 *   no price, so its lot waits for a cost (ADR-048), and part of every
 *   second such lot is moved into another lot, which leaves a lot waiting
 *   that came from it: about one lot in 50 waits in all. A material is
 *   never bought so: a pool with stock waiting gives no average (#650), and
 *   a run draws on it, so the batches made from it would wait on it too;
 * - part of one other tracked receipt in `LOT_CHANGE_EVERY` is moved too,
 *   a quarter of what is at the home bin, into a new lot or the item's
 *   previous one by turns: about one movement in 200 is a lot change;
 * - in week `START_WEEK` every `START_TRACKING_EVERY`th untracked good
 *   starts tracking lots, so its later receipts carry one.
 */
const MADE_HERE_EVERY = 20;
const EXPIRY_NOT_KNOWN_EVERY = 50;
const WAITING_EVERY = 60;
const LOT_CHANGE_EVERY = 13;
const START_TRACKING_EVERY = 10;
const START_WEEK = 26;

/**
 * Writes one organization's year (ADR-051), a week at a time.
 *
 * In the order a business does things, so every step is one the services
 * accept: stock is bought and put away before it is sold, a sale only takes
 * what is free, a run only starts when its materials are on the shelf, and
 * an invoice follows the shipment it bills. A refusal from a service is a
 * bug in this bookkeeping or in the app, and stops the seed loudly — the
 * same smoke-test role seed:demo plays.
 */
export class OrganizationWriter {
  private readonly today = new Date().toISOString().slice(0, 10);

  private dockId = '';
  private blendingId = '';
  private returnsId = '';
  private taxCodeId = '';
  private suppliers: string[] = [];
  private customers: string[] = [];
  private items: Item[] = [];
  private itemsByVariant = new Map<string, Item>();
  private recipes: Recipe[] = [];
  private goodsByBin = new Map<string, Item[]>();
  private rawBinIds: string[] = [];
  private aisleBinIds: string[] = [];
  private pending: PendingShipment[] = [];
  private traceLotId: string | null = null;

  private sequence = 0;
  private lotCount = 0;
  private goodsLines = 0;
  private trackedReceipts = 0;
  private waitingReceipts = 0;
  private lotMoves = 0;
  private calls = 0;
  private skippedSales = 0;

  constructor(
    private readonly services: Services,
    private readonly volume: Volume,
    private readonly random: Random,
    private readonly actorId: string,
    private readonly logger: LoggerService,
  ) {}

  async write(): Promise<Anchors> {
    await this.setUp();
    this.logger.log(
      `Catalogue ready: ${this.items.length} products, ${this.recipes.length} recipes`,
    );

    // Speed since the last progress line, not since the start: an average
    // over the whole run counts the cheap catalogue inserts, and any time
    // the machine slept, as if they were the current pace.
    let lastAt = Date.now();
    let lastCalls = this.calls;

    for (let week = 0; week < WEEKS; week++) {
      await this.shipPending();
      if (week === START_WEEK) await this.startTracking();
      await this.buy(inWeek(this.volume.purchaseOrders, week));
      await this.make(inWeek(this.volume.productionRuns, week));
      await this.sell(inWeek(this.volume.saleOrders, week));
      await this.count(inWeek(this.volume.adjustments, week));
      await this.handOut(inWeek(this.volume.samples, week));

      if ((week + 1) % 4 === 0 || week === WEEKS - 1) {
        const now = Date.now();
        const seconds = Math.max((now - lastAt) / 1000, 0.001);
        const rate = Math.round((this.calls - lastCalls) / seconds);

        this.logger.log(
          `Week ${week + 1}/${WEEKS}: ${this.calls} service calls, ${rate}/s since the last line`,
        );

        lastAt = now;
        lastCalls = this.calls;
      }
    }

    if (this.skippedSales > 0) {
      this.logger.warn(
        `${this.skippedSales} sales skipped for want of free stock`,
      );
    }

    // At year end, from what is free then (ADR-085).
    const made = new Set(this.recipes.map((recipe) => recipe.output.variantId));
    const points = await writeReorderPoints(
      this.services.reorderPoints,
      this.items.map((item) => ({
        variantId: item.variantId,
        made: made.has(item.variantId),
        free: free(item) + item.elsewhere,
      })),
    );
    this.calls += points;
    this.logger.log(`Reorder points on ${points} items`);

    return {
      customerId: this.customers[0],
      supplierId: this.suppliers[0],
      dockLocationId: this.dockId,
      taxCodeId: this.taxCodeId,
      traceLotId: this.traceLotId,
    };
  }

  // ---------------------------------------------------------------------------
  // Set-up: what an organization configures before its first order

  private async setUp() {
    const s = this.services;

    // Issuing needs a registered address and a tax number, and valuation a
    // base currency (ADR-046, ADR-048). A fresh organization has none.
    await s.organization.update({
      baseCurrency: 'CAD',
      taxRegistrationNumber: '123456789 RT0001',
    });
    await s.organization.setAddress({
      line1: '100 Volume Way',
      city: 'Vancouver',
      region: 'BC',
      postalCode: 'V6B 1A1',
      country: 'CA',
    });

    const gst = await s.taxCodes.create({
      name: 'GST',
      components: [{ name: 'GST', rate: '5' }],
    });
    this.taxCodeId = gst.id;

    // One rate for the year: receipts are all dated today, since a service
    // cannot backdate one, and a USD receipt is valued at the day's rate.
    await s.exchangeRates.set({
      currency: 'USD',
      rateDate: this.today,
      rate: '1.3700',
    });

    await this.setUpLocations();
    await this.setUpPartners();
    await this.setUpCatalogue();
    await this.setUpRecipes();
    await this.setUpPriceList();
  }

  private async setUpLocations() {
    const s = this.services;

    const site = await s.locations.create({ type: 'site', name: 'Main' });
    const bin = (name: string, code: string) =>
      s.locations.create({ type: 'bin', name, code, parentId: site.id });

    // Receipts land on the dock and are put away from there, as a warehouse
    // does: two movements per received line, which is most of the ledger's
    // inbound side.
    this.dockId = (await bin('Receiving dock', 'DOCK')).id;
    this.blendingId = (await bin('Blending room', 'BLEND')).id;

    // Unavailable bins (ADR-042): returns wait here to be checked.
    const returns = await bin('Returns', 'RETURNS');
    await s.locations.update(returns.id, { isAvailable: false });
    this.returnsId = returns.id;

    const retention = await bin('Retention', 'RETAIN');
    await s.locations.update(retention.id, { isAvailable: false });

    for (let i = 1; i <= this.volume.materialBins; i++) {
      const raw = await bin(`Raw ${i}`, `RAW-${pad(i, 2)}`);
      this.goodsByBin.set(raw.id, []);
    }

    for (let i = 1; i <= this.volume.goodsBins; i++) {
      const goods = await bin(`Aisle ${i}`, `A-${pad(i, 3)}`);
      this.goodsByBin.set(goods.id, []);
    }

    this.calls += 6 + this.volume.materialBins + this.volume.goodsBins;
  }

  private async setUpPartners() {
    for (let i = 1; i <= this.volume.suppliers; i++) {
      const partner = await this.services.partners.create({
        name: this.partnerName(i),
        code: `S${pad(i, 4)}`,
      });
      this.suppliers.push(partner.id);
    }

    // Every customer gets a billing address: issuing an invoice refuses a
    // customer without one (ADR-046), as it would in real use.
    for (let i = 1; i <= this.volume.customers; i++) {
      // Some customers' documents in other languages (ADR-054), so
      // issuing reads product names as it does in real use: every
      // fourth in French with English beside it, every tenth in Chinese,
      // and named in Chinese too, for Partners' search by pinyin
      // (ADR-056). By position, not by the random source, so the rest of
      // the year is the same data as before and the budgets compare.
      const languages = documentLanguagesFor(i);
      const partner = await this.services.partners.create({
        name: this.partnerName(i, languages.documentLanguage === 'zh-Hans'),
        code: `C${pad(i, 4)}`,
        ...languages,
      });

      await this.services.partnerAddresses.create(partner.id, {
        label: 'Accounts payable',
        line1: `${i} Commerce Street`,
        city: 'Vancouver',
        region: 'BC',
        postalCode: 'V6B 1A1',
        country: 'CA',
        isBilling: true,
        isDefault: true,
      });

      this.customers.push(partner.id);
    }

    this.calls += this.volume.suppliers + this.volume.customers * 2;
  }

  private async setUpCatalogue() {
    const bins = [...this.goodsByBin.keys()];
    const materialBins = bins.slice(0, this.volume.materialBins);
    const goodsBins = bins.slice(this.volume.materialBins);
    this.rawBinIds = materialBins;
    this.aisleBinIds = goodsBins;

    // About thirty categories, three levels deep, before the items that
    // sit in them (ADR-092).
    const categoryOf = await writeCategories(this.services.categories);
    this.calls += CATEGORY_COUNT;

    const { products, materialShare, packagingShare } = this.volume;
    const materials = Math.round(products * materialShare);
    const packaging = Math.round(products * packagingShare);

    for (let i = 1; i <= this.volume.products; i++) {
      const kind: Kind =
        i <= materials
          ? 'material'
          : i <= materials + packaging
            ? 'packaging'
            : 'good';
      const tracked =
        kind === 'material' ||
        (kind === 'good' && this.random.chance(this.volume.trackedGoodsShare));

      const drawn = this.productFor(kind, i, tracked);

      // Its type and its category by position, after every draw, so the
      // random source runs as it always has (ADR-092; write-categories.ts).
      const type = typeAt(kind, i);
      const { input, chineseName } = typed(type, i, drawn);
      const product = await this.services.products.create({
        ...input,
        type,
        categoryId: categoryOf(type, i) ?? undefined,
      });

      // Names in other languages on most finished goods (ADR-054): French
      // on two in three, Chinese on one in three, so an invoice in either
      // language finds a name for most lines and falls back for the rest,
      // and a Chinese reader's search has names to find (ADR-056).
      // By position again, leaving the random sequence untouched.
      const translations = [
        ...(kind === 'good' && i % 3 !== 0
          ? [{ locale: 'fr-CA' as const, name: `${input.name} (FR)` }]
          : []),
        ...(chineseName && i % 3 === 0
          ? [{ locale: 'zh-Hans' as const, name: chineseName }]
          : []),
      ];
      if (translations.length > 0) {
        await this.services.products.setTranslations(product.id, {
          translations,
        });
        this.calls += 1;
      }

      // Materials sit in the raw bins, everything else in the aisles. One
      // home bin per item keeps "where is it" a single answer, so a sale can
      // ship from one location as the API requires.
      const homeBinId =
        kind === 'material'
          ? materialBins[i % materialBins.length]
          : goodsBins[i % goodsBins.length];

      const item: Item = {
        productId: product.id,
        variantId: product.variants[0].id,
        tracked,
        kind,
        type,
        homeBinId,
        priceCents: this.random.int(500, 8_000),
        onHand: 0,
        committed: 0,
        elsewhere: 0,
        expired: 0,
        receipts: 0,
        lastLotId: null,
      };

      this.items.push(item);
      this.itemsByVariant.set(item.variantId, item);
      this.goodsByBin.get(homeBinId)!.push(item);
    }

    this.calls += this.volume.products;
  }

  /**
   * Each recipe makes a lot-tracked good from two or three materials, with
   * its bottle supplied by someone else, as the demo's recipe is (ADR-039).
   */
  private async setUpRecipes() {
    const outputs = this.random.sample(
      this.items.filter((item) => item.kind === 'good' && item.tracked),
      this.volume.recipes,
    );
    const materials = this.items.filter((item) => item.kind === 'material');
    const packaging = this.items.filter((item) => item.kind === 'packaging');

    for (const output of outputs) {
      const components = this.random
        .sample(materials, this.random.int(2, 3))
        .map((item) => ({ item, quantity: this.random.int(5, 30) }));

      const bom = await this.services.boms.create({
        outputVariantId: output.variantId,
        outputQuantity: '100',
        lines: [
          ...components.map((component) => ({
            componentVariantId: component.item.variantId,
            quantity: String(component.quantity),
          })),
          {
            componentVariantId: this.random.pick(packaging).variantId,
            quantity: '100',
            supplyType: 'external',
          },
        ],
      });

      await this.services.boms.promote(bom.id);
      this.calls += 2;

      this.recipes.push({
        bomId: bom.id,
        output,
        outputQuantity: 100,
        components,
      });
    }
  }

  /**
   * The organization's default sale list (ADR-049), priced for every good.
   * About half of each sale's lines are added without a price and take it
   * from here, so both paths of pricing a line are in the data.
   */
  private async setUpPriceList() {
    const list = await this.services.priceLists.create({
      name: 'Wholesale CAD',
      direction: 'sale',
      currency: 'CAD',
    });

    for (const item of this.items) {
      if (item.kind !== 'good') continue;

      await this.services.priceLists.setItem(list.id, item.variantId, {
        unitPrice: money(item.priceCents),
      });
      this.calls++;
    }

    await this.services.organization.update({
      defaultSalePriceListId: list.id,
    });
  }

  // ---------------------------------------------------------------------------
  // A week of business

  /**
   * Purchases, received on the dock and put away. A tenth are in US dollars,
   * so receipts go through the rate lookup (ADR-048). A few are left as
   * drafts or open, as a real year ends with some still on order.
   */
  private async buy(count: number) {
    for (let i = 0; i < count; i++) {
      const items = this.restockCandidates(this.random.int(2, 6));
      const currency = this.random.chance(0.1) ? 'USD' : 'CAD';

      const order = await this.services.orders.create(
        {
          partnerId: this.random.pick(this.suppliers),
          direction: 'purchase',
          reference: `PO-${this.next()}`,
          lines: items.map((item) => {
            const quantityOrdered = String(this.purchaseQuantity(item));

            // Bought with the price to follow: its lot waits for a cost.
            const waits =
              item.kind === 'good' &&
              item.tracked &&
              ++this.goodsLines % WAITING_EVERY === 14;
            if (waits) return { variantId: item.variantId, quantityOrdered };

            return {
              variantId: item.variantId,
              quantityOrdered,
              unitPrice: money(Math.round(item.priceCents * 0.45)),
              currency,
            };
          }),
        },
        this.actorId,
      );
      this.calls++;

      if (this.random.chance(this.volume.draftShare)) continue;

      await this.services.orders.update(order.id, { status: 'confirmed' });
      this.calls++;

      if (this.random.chance(this.volume.openShare)) continue;

      for (const line of order.lines) {
        const item = this.itemFor(line.variantId);
        const quantity = line.quantityOrdered;

        const lot = item.tracked ? this.receivedLot(120, 900) : undefined;
        const receipt = await this.services.receipts.receive(
          order.id,
          line.id,
          {
            toLocationId: this.dockId,
            quantity,
            lot,
          },
          this.actorId,
        );

        // Most of it goes to its home bin; now and then a third of it to
        // another, so the lot is in two places.
        const apart = this.putAwayApart(item, Number(quantity));

        await this.services.stock.record(
          {
            variantId: item.variantId,
            lotId: receipt.lotId,
            fromLocationId: this.dockId,
            toLocationId: item.homeBinId,
            quantity: apart > 0 ? String(Number(quantity) - apart) : quantity,
            reason: 'transfer',
          },
          this.actorId,
        );

        if (apart > 0) {
          await this.services.stock.record(
            {
              variantId: item.variantId,
              lotId: receipt.lotId,
              fromLocationId: this.dockId,
              toLocationId: this.otherBinOf(item),
              quantity: String(apart),
              reason: 'transfer',
            },
            this.actorId,
          );
          this.calls++;
        }

        if (this.isExpired(lot)) {
          item.expired += Number(quantity);
        } else {
          item.onHand += Number(quantity) - apart;
          item.elsewhere += apart;
        }
        this.calls += 2;

        // A lot already expired is never moved into or out of, and what
        // moves out of a lot waiting for a cost leaves a lot waiting.
        if (lot && receipt.lotId && !this.isExpired(lot)) {
          const previous = item.lastLotId;
          item.lastLotId = receipt.lotId;

          if (this.movesPart(line.unitPrice === null)) {
            await this.moveToAnotherLot(
              item,
              receipt.lotId,
              previous,
              Number(quantity) - apart,
            );
          }
        }
      }
    }
  }

  /**
   * Production runs: released from the raw bins, output recorded into a new
   * batch, closed at plan, and the batch put away. The first batch made is
   * the trace target, since its ingredients and its customers are both on
   * record by the end of the year.
   */
  private async make(count: number) {
    for (let i = 0; i < count; i++) {
      const recipe = this.makeableRecipe();
      if (!recipe) continue;

      const batches = this.random.int(1, 3);
      const planned = recipe.outputQuantity * batches;

      const run = await this.services.runs.create({
        outputVariantId: recipe.output.variantId,
        bomId: recipe.bomId,
        locationId: this.blendingId,
        quantityPlanned: String(planned),
        reference: `RUN-${this.next()}`,
      });

      // Each component from its own raw bin. Lots are left to the server,
      // earliest expiry first (ADR-039).
      await this.services.execution.release(
        run.id,
        {
          sourceLocationId: recipe.components[0].item.homeBinId,
          overrides: recipe.components.map((component) => ({
            componentVariantId: component.item.variantId,
            sourceLocationId: component.item.homeBinId,
          })),
        },
        this.actorId,
      );

      for (const component of recipe.components) {
        component.item.onHand -= component.quantity * batches;
      }

      // A little under plan, as a real batch usually is.
      const loss = this.random.int(0, Math.floor(planned * 0.03));
      const produced = planned - loss;

      const lot = this.newLot(365, 1_000);
      const output = await this.services.execution.recordOutput(
        run.id,
        { quantity: String(produced), lot },
        this.actorId,
      );

      // No lines: everything issued is consumed at plan.
      await this.services.closing.close(run.id, {}, this.actorId);

      await this.services.stock.record(
        {
          variantId: recipe.output.variantId,
          lotId: output.lotId,
          fromLocationId: this.blendingId,
          toLocationId: recipe.output.homeBinId,
          quantity: String(produced),
          reason: 'transfer',
        },
        this.actorId,
      );

      if (this.isExpired(lot)) recipe.output.expired += produced;
      else recipe.output.onHand += produced;
      this.traceLotId ??= output.lotId;
      this.calls += 5;
    }
  }

  /**
   * Sales, each from one aisle so it ships from one location. Most ship in
   * two parts a week apart; a few stay drafts or confirmed and unshipped,
   * which is what the orders list shows by default.
   */
  private async sell(count: number) {
    for (let i = 0; i < count; i++) {
      const pick = this.sellable();

      if (!pick) {
        this.skippedSales++;
        continue;
      }

      const { binId, items } = pick;
      const quantities = new Map(
        items.map((item) => [
          item.variantId,
          this.random.int(5, Math.min(60, free(item))),
        ]),
      );

      const order = await this.services.orders.create(
        {
          partnerId: this.random.pick(this.customers),
          direction: 'sale',
          reference: `SO-${this.next()}`,
          lines: items.map((item) => ({
            variantId: item.variantId,
            quantityOrdered: String(quantities.get(item.variantId)),
            ...(this.random.chance(0.5)
              ? { unitPrice: money(item.priceCents), currency: 'CAD' }
              : {}),
          })),
        },
        this.actorId,
      );
      this.calls++;

      if (this.random.chance(this.volume.draftShare)) continue;

      await this.services.orders.update(order.id, { status: 'confirmed' });
      this.calls++;

      const parts: Part[] = order.lines.map((line) => {
        const item = this.itemFor(line.variantId);
        const quantity = quantities.get(item.variantId)!;
        item.committed += quantity;
        return { lineId: line.id, item, quantity };
      });

      if (this.random.chance(this.volume.openShare)) continue;

      if (!this.random.chance(this.volume.splitShare)) {
        await this.ship(order.id, binId, parts);
        continue;
      }

      const first = parts.map((part) => ({
        ...part,
        quantity: Math.ceil(part.quantity * 0.6),
      }));
      const rest = parts
        .map((part, index) => ({
          ...part,
          quantity: part.quantity - first[index].quantity,
        }))
        .filter((part) => part.quantity > 0);

      await this.ship(order.id, binId, first);
      if (rest.length > 0) {
        this.pending.push({ orderId: order.id, binId, parts: rest });
      }
    }
  }

  /**
   * Whether this tracked receipt has part of its lot moved into another
   * (ADR-094, R20), by position: every second one that waits for a cost,
   * and one of every `LOT_CHANGE_EVERY` of the rest.
   */
  private movesPart(waiting: boolean): boolean {
    this.trackedReceipts += 1;
    if (waiting) return this.waitingReceipts++ % 2 === 0;
    return this.trackedReceipts % LOT_CHANGE_EVERY === 6;
  }

  /**
   * A quarter of what a receipt put at the item's home bin moved into the
   * item's previous lot or into a new one, by turns. New codes are typed,
   * `LM-nnnnnn`, from a counter of their own: the shared sequence stays as
   * it was, so every other number in the year is the number it was.
   */
  private async moveToAnotherLot(
    item: Item,
    lotId: string,
    previousLotId: string | null,
    atHome: number,
  ) {
    if (atHome < 1) return;

    this.lotMoves += 1;
    const intoPrevious = previousLotId !== null && this.lotMoves % 2 === 0;

    await this.services.lotChanges.move(
      lotId,
      {
        locationId: item.homeBinId,
        quantity: String(Math.max(1, Math.floor(atHome / 4))),
        ...(intoPrevious
          ? { toLotId: previousLotId }
          : { lot: { code: `LM-${pad(this.lotMoves, 6)}` } }),
        note: 'Part of this delivery belongs to another lot',
      },
      this.actorId,
    );
    this.calls++;
  }

  /**
   * Lot tracking starts for every `START_TRACKING_EVERY`th untracked good
   * (ADR-094, R15), the code's stock and cost history moving into one lot.
   * From here its receipts carry a lot, and counts and hand-outs, which
   * are for untracked stock, leave it alone.
   */
  private async startTracking() {
    const untracked = this.items.filter(
      (item) =>
        item.kind === 'good' && item.type !== 'equipment' && !item.tracked,
    );
    let started = 0;

    for (const [index, item] of untracked.entries()) {
      if ((index + 1) % START_TRACKING_EVERY !== 0) continue;

      // Doesn't expire outright, so the seeded year reads as it did
      // before the start's default became Not known yet (ADR-094, S6).
      await this.services.lotTracking.start(
        item.productId,
        item.variantId,
        { expiry: 'none' },
        this.actorId,
      );
      item.tracked = true;
      started++;
    }

    this.calls += started;
    this.logger.log(
      `Lot tracking started on ${started} goods, in week ${START_WEEK + 1}`,
    );
  }

  /** Last week's second parts. Whatever is left at year end stays open. */
  private async shipPending() {
    const due = this.pending;
    this.pending = [];

    for (const shipment of due) {
      await this.ship(shipment.orderId, shipment.binId, shipment.parts);
    }
  }

  private async ship(orderId: string, binId: string, parts: Part[]) {
    const shipment = await this.services.shipping.ship(
      orderId,
      {
        fromLocationId: binId,
        carrier: 'Canada Post',
        lines: parts.map((part) => ({
          lineId: part.lineId,
          quantity: String(part.quantity),
        })),
      },
      this.actorId,
    );
    this.calls++;

    for (const part of parts) {
      part.item.onHand -= part.quantity;
      part.item.committed -= part.quantity;
    }

    if (this.random.chance(this.volume.invoiceShare)) {
      await this.invoice(orderId, shipment.id, parts);
    }
  }

  /**
   * An invoice for one shipment, issued, and now and then credited: a price
   * credit with nothing back, or an RMA whose goods come back first
   * (ADR-046, ADR-047). A few drafts are left unissued.
   */
  private async invoice(orderId: string, shipmentId: string, parts: Part[]) {
    const s = this.services;

    const draft = await s.invoiceDrafts.createDraft(
      { shipmentId, taxCodeId: this.taxCodeId },
      this.actorId,
    );
    this.calls++;

    if (this.random.chance(0.03)) return;

    const invoice = await s.invoiceIssuing.issue(
      draft.id,
      { invoiceDate: this.today },
      this.actorId,
    );
    this.calls++;

    const roll = this.random.next();

    if (roll < this.volume.creditShare) {
      await s.creditNotes.issue(
        invoice.id,
        {
          reason: 'Price adjustment',
          creditDate: this.today,
          lines: [{ invoiceLineId: draft.lines[0].id, quantity: '1' }],
        },
        this.actorId,
      );
      this.calls++;
      return;
    }

    if (roll >= this.volume.creditShare + this.volume.rmaShare) return;

    // Untracked only: a tracked return has to name the lots it brings back,
    // and which lots a shipment took is the server's choice, not the seed's.
    const part = parts.find((candidate) => !candidate.item.tracked);
    const invoiceLine = part
      ? draft.lines.find((line) => line.orderLineId === part.lineId)
      : undefined;
    if (!part || !invoiceLine) return;

    const rma = await s.rmas.create(
      {
        orderId,
        invoiceId: invoice.id,
        reason: 'Damaged in transit',
        lines: [{ lineId: part.lineId, quantity: '1', resolution: 'credit' }],
      },
      this.actorId,
    );

    await s.returns.receive(
      orderId,
      {
        toLocationId: this.returnsId,
        returnAuthorizationId: rma.id,
        reason: 'damaged',
        lines: [{ lineId: part.lineId, quantity: '1' }],
      },
      this.actorId,
    );

    await s.creditNotes.issue(
      invoice.id,
      {
        reason: `Returned under ${rma.number}`,
        creditDate: this.today,
        lines: [
          {
            invoiceLineId: invoiceLine.id,
            quantity: '1',
            returnAuthorizationLineId: rma.lines[0].id,
          },
        ],
      },
      this.actorId,
    );
    this.calls += 3;
  }

  /**
   * Cycle counts on untracked stock: mostly found, sometimes missing, never
   * more missing than is free. Tracked stock is corrected by lot, which is a
   * different screen and not what this volume is for.
   */
  private async count(count: number) {
    const untracked = this.items.filter((item) => !item.tracked);

    for (let i = 0; i < count; i++) {
      const item = this.random.pick(untracked);
      const found = free(item) < 1 || this.random.chance(0.7);
      const quantity = found
        ? this.random.int(1, 10)
        : this.random.int(1, Math.min(10, free(item)));

      await this.services.stock.record(
        {
          variantId: item.variantId,
          ...(found
            ? { toLocationId: item.homeBinId }
            : { fromLocationId: item.homeBinId }),
          quantity: String(quantity),
          reason: 'adjustment',
          reasonDetail: 'miscount',
          note: found
            ? 'Cycle count: more on the shelf than recorded'
            : 'Cycle count: fewer on the shelf than recorded',
        },
        this.actorId,
      );

      item.onHand += found ? quantity : -quantity;
      this.calls++;
    }
  }

  private async handOut(count: number) {
    for (let i = 0; i < count; i++) {
      const candidates = this.items.filter(
        (item) => item.kind === 'good' && !item.tracked && free(item) >= 3,
      );
      if (candidates.length === 0) return;

      const item = this.random.pick(candidates);
      const quantity = this.random.int(1, 3);

      await this.services.stock.record(
        {
          variantId: item.variantId,
          fromLocationId: item.homeBinId,
          quantity: String(quantity),
          reason: 'sample',
          recipientPartnerId: this.random.pick(this.customers),
          note: 'Trade sample',
        },
        this.actorId,
      );

      item.onHand -= quantity;
      this.calls++;
    }
  }

  // ---------------------------------------------------------------------------
  // Choosing

  /** The lower-stocked of two random items, for each line: restocking. */
  private restockCandidates(count: number): Item[] {
    const chosen = new Set<Item>();
    const buyable = this.items;

    // Bounded, in case the catalogue is smaller than the line count asked.
    for (let attempt = 0; attempt < count * 10; attempt++) {
      if (chosen.size === count) break;

      const a = this.random.pick(buyable);
      const b = this.random.pick(buyable);
      chosen.add(free(a) <= free(b) ? a : b);
    }

    return [...chosen];
  }

  private purchaseQuantity(item: Item): number {
    if (item.kind === 'material') return this.random.int(200, 1_000);
    if (item.kind === 'packaging') return this.random.int(100, 500);
    return this.random.int(40, 160);
  }

  /** An aisle with at least two goods free to sell, and two to six of them. */
  private sellable(): { binId: string; items: Item[] } | undefined {
    const aisles = [...this.goodsByBin.entries()].filter(([, items]) =>
      items.some((item) => item.kind === 'good'),
    );

    for (let attempt = 0; attempt < 6; attempt++) {
      const [binId, items] = this.random.pick(aisles);
      const candidates = items.filter(
        (item) => item.kind === 'good' && free(item) >= 5,
      );

      if (candidates.length >= 2) {
        return {
          binId,
          items: this.random.sample(candidates, this.random.int(2, 6)),
        };
      }
    }

    return undefined;
  }

  private makeableRecipe(): Recipe | undefined {
    for (let attempt = 0; attempt < 5; attempt++) {
      const recipe = this.random.pick(this.recipes);

      // Three batches' worth, so whichever batch count is drawn is covered.
      if (
        recipe.components.every(
          (component) => free(component.item) >= component.quantity * 3,
        )
      ) {
        return recipe;
      }
    }

    return undefined;
  }

  private itemFor(variantId: string): Item {
    const item = this.itemsByVariant.get(variantId);
    if (!item) throw new Error(`No catalogue item for variant ${variantId}`);
    return item;
  }

  // ---------------------------------------------------------------------------
  // Naming

  /** What to create, and for a good, its name in Chinese. */
  private productFor(kind: Kind, index: number, tracked: boolean) {
    if (kind === 'material') {
      return {
        input: {
          type: 'material' as const,
          name: `${this.random.pick(MATERIALS)} extract`,
          variant: {
            sku: `M-${pad(index, 5)}`,
            unitOfMeasure: 'kg',
            tracksLots: true,
          },
        },
        chineseName: null,
      };
    }

    if (kind === 'packaging') {
      return {
        input: {
          type: 'packaging' as const,
          name: `${this.random.pick(COUNTS)}ct bottle`,
          variant: { sku: `P-${pad(index, 5)}`, unitOfMeasure: 'each' },
        },
        chineseName: null,
      };
    }

    // In this order, as the random source always picked them.
    const [name, nameZh] = this.random.pick(GOOD_NAMES);
    const [form, formZh] = this.random.pick(GOOD_FORMS);
    const count = this.random.pick(COUNTS);

    return {
      input: {
        type: 'good' as const,
        name: `${name} ${form} ${count}ct`,
        variant: {
          sku: `G-${pad(index, 5)}`,
          unitOfMeasure: 'each',
          tracksLots: tracked,
        },
      },
      chineseName: `${nameZh}${formZh}胶囊 ${count} 粒`,
    };
  }

  /** In Chinese for a Chinese business, as 港湾药房 0010. */
  private partnerName(index: number, inChinese = false): string {
    const [word, wordZh] = this.random.pick(PARTNER_WORDS);
    const [kind, kindZh] = this.random.pick(PARTNER_KINDS);
    return inChinese
      ? `${wordZh}${kindZh} ${pad(index, 4)}`
      : `${word} ${kind} ${pad(index, 4)}`;
  }

  /**
   * A lot code unique in the organization, expiring in a range of days;
   * by its position, within the year after the seed's day or already
   * past (32a).
   */
  private newLot(
    minDays: number,
    maxDays: number,
  ): { code: string; expiresAt?: string } {
    const code = `LV-${pad(this.next(), 7)}`;
    const position = ++this.lotCount;

    // A tenth never expire, so earliest-expiry-first has undated lots to
    // sort last, as it does with real stock (ADR-039). Drawn as before
    // whatever the position says, so the random source stays in step.
    const drawn = this.random.chance(0.1)
      ? null
      : this.random.int(minDays, maxDays);
    const days =
      position % PAST_EVERY === 0
        ? -(2 + ((position / PAST_EVERY) % 60))
        : position % WITHIN_YEAR_EVERY === 0
          ? 2 + (((position / WITHIN_YEAR_EVERY) * DAY_STRIDE) % 363)
          : drawn;
    if (days === null) return { code };

    const expires = new Date();
    expires.setUTCDate(expires.getUTCDate() + days);
    return { code, expiresAt: expires.toISOString().slice(0, 10) };
  }

  /**
   * A lot arriving with a receipt (ADR-094, R23): the lot `newLot` makes,
   * or by its position one whose code the lot series makes, carrying a
   * supplier's lot on every second such code, or one whose expiry is not
   * known yet. A batch's lot is the run's own and never one of these.
   */
  private receivedLot(
    minDays: number,
    maxDays: number,
  ): {
    code?: string;
    makeCode?: boolean;
    supplierLot?: string;
    expiry?: LotExpiry;
    expiresAt?: string;
  } {
    const lot = this.newLot(minDays, maxDays);
    const position = this.lotCount;

    if (position % MADE_HERE_EVERY === 3) {
      const withSupplierLot = Math.floor(position / MADE_HERE_EVERY) % 2 === 1;
      return {
        makeCode: true,
        ...(withSupplierLot ? { supplierLot: `SUP-${pad(position, 6)}` } : {}),
        ...(lot.expiresAt ? { expiresAt: lot.expiresAt } : {}),
      };
    }
    if (position % EXPIRY_NOT_KNOWN_EVERY === 11) {
      return { code: lot.code, expiry: 'unknown' };
    }
    return lot;
  }

  /** A lot already expired on the seed's day, which no sale may hold. */
  private isExpired(lot: { expiresAt?: string } | undefined): boolean {
    return lot?.expiresAt !== undefined && lot.expiresAt < this.today;
  }

  /**
   * How much of a receipt is put away apart from the item's home bin: a
   * third of every `APART_EVERY`th receipt of it, nothing of the rest.
   */
  private putAwayApart(item: Item, quantity: number): number {
    item.receipts += 1;
    if (item.receipts % APART_EVERY !== 0) return 0;
    return Math.max(1, Math.floor(quantity / 3));
  }

  /**
   * Another bin of the item's kind, the next one along from its home and
   * then the one after, receipt by receipt, never its home: a code reaches
   * a few places over the year, by position.
   */
  private otherBinOf(item: Item): string {
    const group = item.kind === 'material' ? this.rawBinIds : this.aisleBinIds;
    const at = group.indexOf(item.homeBinId);
    const nth = item.receipts / APART_EVERY;
    const step = 1 + ((nth - 1) % (group.length - 1));
    return group[(at + step) % group.length];
  }

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }
}

/**
 * A supply, a sample or a piece of equipment named as one, from the name
 * the random source already drew (so none is drawn here). A good keeps its
 * name, its French and its Chinese; the others are named by position.
 */
function typed<
  T extends { input: { name: string }; chineseName: string | null },
>(type: ProductType, index: number, drawn: T): T {
  const named = (name: string, chineseName: string | null): T => ({
    ...drawn,
    input: { ...drawn.input, name },
    chineseName,
  });

  if (type === 'supply') {
    return named(`${SUPPLIES[index % SUPPLIES.length]} ${pad(index, 5)}`, null);
  }
  if (type === 'equipment') {
    return named(
      `${EQUIPMENT[index % EQUIPMENT.length]} ${pad(index, 5)}`,
      null,
    );
  }
  if (type === 'sample') {
    return named(
      `${drawn.input.name} sample`,
      drawn.chineseName && `${drawn.chineseName} 试用装`,
    );
  }
  return drawn;
}

function free(item: Item): number {
  return item.onHand - item.committed;
}

function money(cents: number): string {
  return `${Math.floor(cents / 100)}.${pad(cents % 100, 2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** A customer's document languages by its position (ADR-054). */
function documentLanguagesFor(
  position: number,
):
  | { documentLanguage: 'fr-CA'; documentSecondLanguage: 'en' }
  | { documentLanguage: 'zh-Hans' }
  | Record<string, never> {
  if (position % 10 === 0) return { documentLanguage: 'zh-Hans' };
  if (position % 4 === 0) {
    return { documentLanguage: 'fr-CA', documentSecondLanguage: 'en' };
  }
  return {};
}
