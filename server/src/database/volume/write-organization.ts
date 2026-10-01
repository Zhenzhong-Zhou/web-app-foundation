import type { LoggerService } from '@nestjs/common';

import type { Random } from './random';
import { inWeek, type Volume, WEEKS } from './scale';
import type { Services } from './services';

/** The handles perf and the plan check need, recorded in the manifest. */
export interface Anchors {
  customerId: string;
  supplierId: string;
  dockLocationId: string;
  taxCodeId: string;
  /** A batch made from ingredient lots: a trace with both sides filled. */
  traceLotId: string | null;
}

type Kind = 'good' | 'material' | 'packaging';

/**
 * One catalogue item and the seed's own count of it.
 *
 * Whole units only, so plain numbers are exact here. This is the seed's
 * bookkeeping for choosing what can be sold, never a quantity the app reads
 * back: every quantity sent is a string, as the API takes it (ADR-025).
 */
interface Item {
  variantId: string;
  tracked: boolean;
  kind: Kind;
  homeBinId: string;
  /** Cents, so a price is formatted without a float. */
  priceCents: number;
  onHand: number;
  /** Held for confirmed sales not yet shipped (ADR-045). */
  committed: number;
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

const GOOD_NAMES = ['Focus', 'Calm', 'Immune', 'Sleep', 'Energy', 'Joint'];
const GOOD_FORMS = ['Daily', 'Forte', 'Complex', 'Support', 'Formula', 'Max'];
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
const PARTNER_WORDS = ['Cascade', 'Harbour', 'Northside', 'Pacific', 'Summit'];
const PARTNER_KINDS = ['Botanicals', 'Pharmacy', 'Health', 'Naturals'];

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
  private pending: PendingShipment[] = [];
  private traceLotId: string | null = null;

  private sequence = 0;
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
    const started = Date.now();

    await this.setUp();
    this.logger.log(
      `Catalogue ready: ${this.items.length} products, ${this.recipes.length} recipes`,
    );

    for (let week = 0; week < WEEKS; week++) {
      await this.shipPending();
      await this.buy(inWeek(this.volume.purchaseOrders, week));
      await this.make(inWeek(this.volume.productionRuns, week));
      await this.sell(inWeek(this.volume.saleOrders, week));
      await this.count(inWeek(this.volume.adjustments, week));
      await this.handOut(inWeek(this.volume.samples, week));

      if ((week + 1) % 4 === 0 || week === WEEKS - 1) {
        const seconds = (Date.now() - started) / 1000;
        this.logger.log(
          `Week ${week + 1}/${WEEKS}: ${this.calls} service calls, ${Math.round(this.calls / seconds)}/s`,
        );
      }
    }

    if (this.skippedSales > 0) {
      this.logger.warn(
        `${this.skippedSales} sales skipped for want of free stock`,
      );
    }

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
      const partner = await this.services.partners.create({
        name: this.partnerName(i),
        code: `C${pad(i, 4)}`,
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

      const product = await this.services.products.create(
        this.productFor(kind, i, tracked),
      );

      // Materials sit in the raw bins, everything else in the aisles. One
      // home bin per item keeps "where is it" a single answer, so a sale can
      // ship from one location as the API requires.
      const homeBinId =
        kind === 'material'
          ? materialBins[i % materialBins.length]
          : goodsBins[i % goodsBins.length];

      const item: Item = {
        variantId: product.variants[0].id,
        tracked,
        kind,
        homeBinId,
        priceCents: this.random.int(500, 8_000),
        onHand: 0,
        committed: 0,
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
          lines: items.map((item) => ({
            variantId: item.variantId,
            quantityOrdered: String(this.purchaseQuantity(item)),
            unitPrice: money(Math.round(item.priceCents * 0.45)),
            currency,
          })),
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

        const receipt = await this.services.receipts.receive(
          order.id,
          line.id,
          {
            toLocationId: this.dockId,
            quantity,
            lot: item.tracked ? this.newLot(120, 900) : undefined,
          },
          this.actorId,
        );

        await this.services.stock.record(
          {
            variantId: item.variantId,
            lotId: receipt.lotId,
            fromLocationId: this.dockId,
            toLocationId: item.homeBinId,
            quantity,
            reason: 'transfer',
          },
          this.actorId,
        );

        item.onHand += Number(quantity);
        this.calls += 2;
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

      const output = await this.services.execution.recordOutput(
        run.id,
        { quantity: String(produced), lot: this.newLot(365, 1_000) },
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

      recipe.output.onHand += produced;
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

  private productFor(kind: Kind, index: number, tracked: boolean) {
    if (kind === 'material') {
      return {
        type: 'material' as const,
        name: `${this.random.pick(MATERIALS)} extract`,
        variant: {
          sku: `M-${pad(index, 5)}`,
          unitOfMeasure: 'kg',
          tracksLots: true,
        },
      };
    }

    if (kind === 'packaging') {
      return {
        type: 'packaging' as const,
        name: `${this.random.pick(COUNTS)}ct bottle`,
        variant: { sku: `P-${pad(index, 5)}`, unitOfMeasure: 'each' },
      };
    }

    return {
      type: 'good' as const,
      name: `${this.random.pick(GOOD_NAMES)} ${this.random.pick(GOOD_FORMS)} ${this.random.pick(COUNTS)}ct`,
      variant: {
        sku: `G-${pad(index, 5)}`,
        unitOfMeasure: 'each',
        tracksLots: tracked,
      },
    };
  }

  private partnerName(index: number): string {
    return `${this.random.pick(PARTNER_WORDS)} ${this.random.pick(PARTNER_KINDS)} ${pad(index, 4)}`;
  }

  /** A lot code unique in the organization, expiring in a range of days. */
  private newLot(minDays: number, maxDays: number) {
    const code = `LV-${pad(this.next(), 7)}`;

    // A tenth never expire, so earliest-expiry-first has undated lots to
    // sort last, as it does with real stock (ADR-039).
    if (this.random.chance(0.1)) return { code };

    const expires = new Date();
    const days = this.random.int(minDays, maxDays);
    expires.setUTCDate(expires.getUTCDate() + days);
    return { code, expiresAt: expires.toISOString().slice(0, 10) };
  }

  private next(): number {
    this.sequence += 1;
    return this.sequence;
  }
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
