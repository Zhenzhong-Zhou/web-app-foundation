import type { INestApplicationContext } from '@nestjs/common';

import { BomsService } from '../modules/boms/boms.service';
import { InvoiceDraftsService } from '../modules/invoices/invoice-drafts.service';
import { InvoiceIssuingService } from '../modules/invoices/invoice-issuing.service';
import { LocationsService } from '../modules/locations/locations.service';
import { OrderLifecycleService } from '../modules/orders/order-lifecycle.service';
import { OrderLinesService } from '../modules/orders/order-lines.service';
import { OrderReceiptsService } from '../modules/orders/order-receipts.service';
import { ShippingService } from '../modules/orders/shipping.service';
import { PartnersService } from '../modules/partners/partners.service';
import { ProductLicencesService } from '../modules/product-licences/product-licences.service';
import { ProductionExecutionService } from '../modules/production-orders/production-execution.service';
import { ProductionOrdersService } from '../modules/production-orders/production-orders.service';
import { ProductsService } from '../modules/products/products.service';
import { ReturnAuthorizationsService } from '../modules/return-authorizations/return-authorizations.service';
import type { ProductType } from './schema';

/**
 * What seed-demo.ts has already made that this builds on: where stock goes,
 * who it is bought from and sold to, and the tax code a sale is billed with.
 */
export interface DemoAnchors {
  actorId: string;
  siteId: string;
  shelfId: string;
  blendingId: string;
  supplierId: string;
  usSupplierId: string;
  customerId: string;
  secondCustomerId: string;
  gstId: string;
}

/**
 * A plain calendar day, sent the way a date input sends one. Relative to the
 * day the seed runs, so the page reads the same whenever it is seeded.
 */
export function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * A range around the demo's first product, for the screens rather than the
 * rules.
 *
 * seed-demo.ts makes one product end to end and leaves the numbers the
 * manual checks name. That proves the paths, but three items make a short
 * inventory table, no order is a draft or cancelled, and nothing is in
 * progress, so a screen judged by how it reads with real data has little to
 * show. This adds:
 *
 * - a dozen items, several with two lots, expiring at different distances,
 *   one within the month;
 * - a second recipe, with one run released and not yet made and one planned;
 * - an order in every status, and an invoice still in draft;
 * - a receipt waiting for a cost, a discontinued product, a retired partner,
 *   and names long enough to test wrapping in French;
 * - a voided invoice, a purchase line closed short and a closed RMA, so
 *   every state the screens can draw has one example (ADR-055).
 *
 * Run after everything in seed-demo.ts and kept off its items: nothing here
 * moves BF-2609, FOC-2609-01 or FOCUS-60CT, or names a lot with "2609",
 * which the recall drill searches for. The numbered documents it issues
 * come after seed-demo's own, so INV-000001, CN-000001 and RMA-000001, the
 * ones the manual checks name, stay what they were.
 *
 * Through the services, like the rest of the demo, so it is a smoke test of
 * the same paths as well as data.
 */
export async function addVariety(
  app: INestApplicationContext,
  anchors: DemoAnchors,
): Promise<string> {
  const products = app.get(ProductsService);
  const locations = app.get(LocationsService);
  const licences = app.get(ProductLicencesService);
  const partners = app.get(PartnersService);
  const orders = app.get(OrderLifecycleService);
  const receipts = app.get(OrderReceiptsService);
  const shipping = app.get(ShippingService);
  const boms = app.get(BomsService);
  const runs = app.get(ProductionOrdersService);
  const execution = app.get(ProductionExecutionService);
  const invoiceDrafts = app.get(InvoiceDraftsService);
  const issuing = app.get(InvoiceIssuingService);
  const orderLines = app.get(OrderLinesService);
  const rmas = app.get(ReturnAuthorizationsService);

  const actor = anchors.actorId;

  type Order = Awaited<ReturnType<OrderLifecycleService['create']>>;

  /** A product with its one variant; the variant is what stock hangs off. */
  async function item(
    type: ProductType,
    name: string,
    variant: { sku: string; unitOfMeasure: string; tracksLots?: boolean },
  ) {
    const product = await products.create({ type, name, variant });
    return { productId: product.id, variantId: product.variants[0].id };
  }

  /** A line priced in Canadian dollars, as most of the demo is. */
  function cad(variantId: string, quantity: string, unitPrice: string) {
    return {
      variantId,
      quantityOrdered: quantity,
      unitPrice,
      currency: 'CAD',
    };
  }

  /** By variant rather than position, so reordering a list cannot misfile. */
  function lineOf(order: Order, variantId: string): string {
    const line = order.lines.find((each) => each.variantId === variantId);
    if (!line) throw new Error(`The order has no line for ${variantId}`);
    return line.id;
  }

  async function receive(
    order: Order,
    variantId: string,
    quantity: string,
    toLocationId: string,
    lot?: { code: string; expiresInDays: number },
  ) {
    const expiring = lot && {
      code: lot.code,
      expiresAt: daysFromNow(lot.expiresInDays),
    };

    await receipts.receive(
      order.id,
      lineOf(order, variantId),
      { toLocationId, quantity, lot: expiring },
      actor,
    );
  }

  // Probiotics are kept cold, so the location tree has a third bin in use.
  const coldRoom = await locations.create({
    type: 'bin',
    name: 'Cold room',
    code: 'COLD',
    parentId: anchors.siteId,
  });

  // What the second recipe is made of. The extract's name is long on
  // purpose: a column of names has to cope with one like it.
  const ashwagandha = await item(
    'material',
    'Ashwagandha root extract, standardised to 5% withanolides',
    { sku: 'ASH-EXT-5', unitOfMeasure: 'kg', tracksLots: true },
  );
  const theanine = await item('material', 'L-theanine', {
    sku: 'THEANINE',
    unitOfMeasure: 'kg',
    tracksLots: true,
  });
  const magnesium = await item('material', 'Magnesium glycinate', {
    sku: 'MAG-GLY',
    unitOfMeasure: 'kg',
    tracksLots: true,
  });
  const bottle = await item('packaging', '90ct bottle', {
    sku: 'BOTTLE-90',
    unitOfMeasure: 'each',
  });
  const carton = await item('packaging', 'Shipping carton, 24 bottles', {
    sku: 'CARTON-24',
    unitOfMeasure: 'each',
  });

  const calm = await item('good', 'Calm 90ct', {
    sku: 'CALM-90CT',
    unitOfMeasure: 'each',
    tracksLots: true,
  });

  // Bought in and sold as they come: most of what a distributor stocks.
  const vitaminD = await item('good', 'Vitamin D3 1000 IU, 120 softgels', {
    sku: 'D3-1000-120',
    unitOfMeasure: 'each',
    tracksLots: true,
  });
  const omega = await item('good', 'Omega-3 fish oil, 90 softgels', {
    sku: 'OMEGA3-90',
    unitOfMeasure: 'each',
    tracksLots: true,
  });
  const elderberry = await item('good', 'Elderberry syrup, 250 ml', {
    sku: 'ELDER-250',
    unitOfMeasure: 'each',
    tracksLots: true,
  });
  const probiotic = await item('good', 'Probiotic 30 billion, 30 capsules', {
    sku: 'PROBIO-30',
    unitOfMeasure: 'each',
    tracksLots: true,
  });
  const gloves = await item('supply', 'Nitrile gloves, box of 100', {
    sku: 'GLOVES-100',
    unitOfMeasure: 'each',
  });

  // Discontinued before any stock: the list shows the state, nothing else.
  const zinc = await item('good', 'Zinc lozenges, 60 count', {
    sku: 'ZINC-60',
    unitOfMeasure: 'each',
  });
  await products.update(zinc.productId, { isActive: false });

  // Names in the other languages, so the Chinese and French screens show
  // translated names beside the untranslated rest (ADR-054).
  await products.setTranslations(calm.productId, {
    translations: [
      { locale: 'fr-CA', name: 'Calme, 90 capsules' },
      { locale: 'zh-Hans', name: '舒缓胶囊 90 粒' },
    ],
  });
  await products.setTranslations(vitaminD.productId, {
    translations: [
      { locale: 'fr-CA', name: 'Vitamine D3 1000 UI, 120 capsules molles' },
      { locale: 'zh-Hans', name: '维生素 D3 1000 IU，120 粒软胶囊' },
    ],
  });

  const wholesaler = await partners.create({
    name: 'Prairie Naturals Wholesale',
    code: 'PRAIRIE',
  });

  // A customer with a long French name, to test how lists and headers cope
  // with one; its documents print in French and English.
  const cooperative = await partners.create({
    name: 'Coopérative des pharmacies indépendantes du Bas-Saint-Laurent',
    code: 'COOP-BSL',
    documentLanguage: 'fr-CA',
    documentSecondLanguage: 'en',
  });

  // Retired rather than deleted (ADR-026): the list shows how that reads.
  const oldMill = await partners.create({
    name: 'Old Mill Herbs',
    code: 'OLDMILL',
  });
  await partners.update(oldMill.id, { isActive: false });

  /**
   * Five lines, two of them in two lots, received in full and closed: a
   * fulfilled purchase, and most of the inventory table. The first
   * elderberry lot expires in 20 days, the probiotic in 60, so expiry has
   * something near to show.
   */
  const stocking = await orders.create(
    {
      partnerId: wholesaler.id,
      direction: 'purchase',
      reference: 'PO-DEMO-3',
      lines: [
        cad(vitaminD.variantId, '240', '6.4000'),
        cad(omega.variantId, '180', '8.7500'),
        cad(elderberry.variantId, '96', '7.2000'),
        cad(probiotic.variantId, '120', '11.5000'),
        cad(gloves.variantId, '20', '14.0000'),
      ],
    },
    actor,
  );
  await orders.update(stocking.id, { status: 'confirmed' });

  await receive(stocking, vitaminD.variantId, '120', anchors.shelfId, {
    code: 'D3-A11',
    expiresInDays: 540,
  });
  await receive(stocking, vitaminD.variantId, '120', anchors.shelfId, {
    code: 'D3-B02',
    expiresInDays: 700,
  });
  await receive(stocking, omega.variantId, '180', anchors.shelfId, {
    code: 'OMG-0417',
    expiresInDays: 480,
  });
  await receive(stocking, elderberry.variantId, '48', anchors.shelfId, {
    code: 'ELD-24A',
    expiresInDays: 20,
  });
  await receive(stocking, elderberry.variantId, '48', anchors.shelfId, {
    code: 'ELD-25B',
    expiresInDays: 300,
  });
  await receive(stocking, probiotic.variantId, '120', coldRoom.id, {
    code: 'PRB-0731',
    expiresInDays: 60,
  });
  await receive(stocking, gloves.variantId, '20', anchors.shelfId);

  await orders.update(stocking.id, { status: 'fulfilled' });

  /**
   * The second recipe's materials, from the first supplier. The cartons
   * arrive short — 60 of 100 — so the order stays open with something
   * outstanding, the shape most purchases have most of the time.
   */
  const materials = await orders.create(
    {
      partnerId: anchors.supplierId,
      direction: 'purchase',
      reference: 'PO-DEMO-4',
      lines: [
        cad(ashwagandha.variantId, '25', '92.0000'),
        cad(theanine.variantId, '10', '145.0000'),
        cad(magnesium.variantId, '40', '31.5000'),
        cad(bottle.variantId, '2000', '0.4200'),
        cad(carton.variantId, '100', '1.8500'),
      ],
    },
    actor,
  );
  await orders.update(materials.id, { status: 'confirmed' });

  await receive(materials, ashwagandha.variantId, '25', anchors.shelfId, {
    code: 'ASH-0601',
    expiresInDays: 600,
  });
  await receive(materials, theanine.variantId, '10', anchors.shelfId, {
    code: 'THE-0812',
    expiresInDays: 500,
  });
  await receive(materials, magnesium.variantId, '40', anchors.shelfId, {
    code: 'MAG-0703',
    expiresInDays: 720,
  });
  await receive(materials, bottle.variantId, '2000', anchors.shelfId);
  await receive(materials, carton.variantId, '60', anchors.shelfId);

  /**
   * Bought with the price to follow: received, valued at nothing yet, and
   * listed under Stock value as waiting for a cost (ADR-048), so the
   * provisional state has a lot to show. Its expiry is later than the
   * other theanine lot, so the run below takes that one and leaves this
   * whole.
   */
  const priceToFollow = await orders.create(
    {
      partnerId: anchors.usSupplierId,
      direction: 'purchase',
      reference: 'PO-DEMO-5',
      note: 'Price to follow from the supplier',
      lines: [{ variantId: theanine.variantId, quantityOrdered: '5' }],
    },
    actor,
  );
  await orders.update(priceToFollow.id, { status: 'confirmed' });

  await receive(priceToFollow, theanine.variantId, '5', anchors.shelfId, {
    code: 'THE-0915',
    expiresInDays: 650,
  });

  /**
   * A second recipe under its own registration, and two runs of it: one
   * released, its components issued to the blending room and nothing made
   * yet — a run in progress — and one only planned.
   */
  const npn = await licences.create({
    number: '80067890',
    authority: 'Health Canada',
    issuedAt: daysFromNow(-200),
    notes: 'Demo data — not a real registration',
  });

  const recipe = await boms.create({
    outputVariantId: calm.variantId,
    outputQuantity: '1000',
    licenceId: npn.id,
    lines: [
      { componentVariantId: ashwagandha.variantId, quantity: '15' },
      { componentVariantId: theanine.variantId, quantity: '5' },
      { componentVariantId: magnesium.variantId, quantity: '20' },
      { componentVariantId: bottle.variantId, quantity: '1000' },
    ],
  });
  await boms.promote(recipe.id);

  const inProgress = await runs.create({
    outputVariantId: calm.variantId,
    bomId: recipe.id,
    locationId: anchors.blendingId,
    quantityPlanned: '1000',
    reference: 'CALM-RUN-01',
  });
  await execution.release(
    inProgress.id,
    { sourceLocationId: anchors.shelfId },
    actor,
  );

  await runs.create({
    outputVariantId: calm.variantId,
    bomId: recipe.id,
    locationId: anchors.blendingId,
    quantityPlanned: '2000',
    reference: 'CALM-RUN-02',
  });

  // A sale still being put together: a draft, holding nothing.
  await orders.create(
    {
      partnerId: cooperative.id,
      direction: 'sale',
      reference: 'SO-DEMO-3',
      lines: [
        cad(vitaminD.variantId, '48', '14.9900'),
        cad(elderberry.variantId, '24', '12.4900'),
      ],
    },
    actor,
  );

  // One the customer called off before it was confirmed.
  const calledOff = await orders.create(
    {
      partnerId: anchors.customerId,
      direction: 'sale',
      reference: 'SO-DEMO-4',
      lines: [cad(vitaminD.variantId, '24', '14.9900')],
    },
    actor,
  );
  await orders.update(calledOff.id, { status: 'cancelled' });

  /**
   * Shipped in full and closed, with its invoice drafted and not yet issued:
   * a draft has no number, so the numbered series the manual checks count
   * on is untouched. The elderberry comes from the lot that expires first,
   * which leaves half of it on the shelf with 20 days to go.
   */
  const shipped = await orders.create(
    {
      partnerId: anchors.secondCustomerId,
      direction: 'sale',
      reference: 'SO-DEMO-5',
      lines: [
        cad(vitaminD.variantId, '60', '14.9900'),
        cad(omega.variantId, '36', '18.9900'),
        cad(elderberry.variantId, '24', '12.4900'),
      ],
    },
    actor,
  );
  await orders.update(shipped.id, { status: 'confirmed' });

  const shipment = await shipping.ship(
    shipped.id,
    {
      fromLocationId: anchors.shelfId,
      carrier: 'Purolator',
      lines: [
        { lineId: lineOf(shipped, vitaminD.variantId), quantity: '60' },
        { lineId: lineOf(shipped, omega.variantId), quantity: '36' },
        { lineId: lineOf(shipped, elderberry.variantId), quantity: '24' },
      ],
    },
    actor,
  );

  const draft = await invoiceDrafts.createDraft(
    { shipmentId: shipment.id, taxCodeId: anchors.gstId },
    actor,
  );
  await invoiceDrafts.update(draft.id, { dueDate: daysFromNow(30) });

  await orders.update(shipped.id, { status: 'fulfilled' });

  /**
   * A dented carton SO-DEMO-5's customer kept: authorized with nothing to
   * come back and nothing to credit, then closed. The Returns list's
   * Closed, grey beside the open ones.
   */
  const kept = await rmas.create(
    {
      orderId: shipped.id,
      reason: 'Carton dented in transit; customer kept the goods',
      expectsGoods: false,
      lines: [
        {
          lineId: lineOf(shipped, omega.variantId),
          quantity: '2',
          resolution: 'none',
        },
      ],
    },
    actor,
  );
  await rmas.close(kept.id, actor);

  /**
   * Billed at the wrong price and voided: the invoice red, its full credit
   * note marked as voiding it, net invoiced back to nothing and the
   * shipment free to invoice again, which it has not been yet. To the
   * demo's first customer: issuing needs a billing address, which the
   * cooperative, made here for its long name, does not have.
   */
  const rebilled = await orders.create(
    {
      partnerId: anchors.customerId,
      direction: 'sale',
      reference: 'SO-DEMO-6',
      lines: [cad(omega.variantId, '12', '18.9900')],
    },
    actor,
  );
  await orders.update(rebilled.id, { status: 'confirmed' });

  const rebilledShipment = await shipping.ship(
    rebilled.id,
    {
      fromLocationId: anchors.shelfId,
      carrier: 'Canada Post',
      lines: [{ lineId: lineOf(rebilled, omega.variantId), quantity: '12' }],
    },
    actor,
  );
  const wrongPrice = await invoiceDrafts.createDraft(
    { shipmentId: rebilledShipment.id, taxCodeId: anchors.gstId },
    actor,
  );
  await invoiceDrafts.update(wrongPrice.id, { dueDate: daysFromNow(30) });
  await issuing.issue(wrongPrice.id, { invoiceDate: daysFromNow(0) }, actor);
  await issuing.void(
    wrongPrice.id,
    {
      reason: 'Billed at last year’s price list',
      creditDate: daysFromNow(0),
    },
    actor,
  );

  /**
   * Gloves ordered by the box, 40, and the supplier sent 30 and no more:
   * the line closed short, so it offers Reopen in its menu and the order
   * no longer waits for the rest.
   */
  const shortGloves = await orders.create(
    {
      partnerId: anchors.supplierId,
      direction: 'purchase',
      reference: 'PO-DEMO-6',
      lines: [cad(gloves.variantId, '40', '11.5000')],
    },
    actor,
  );
  await orders.update(shortGloves.id, { status: 'confirmed' });
  await receive(shortGloves, gloves.variantId, '30', anchors.shelfId);
  await orderLines.closeLineShort(
    shortGloves.id,
    lineOf(shortGloves, gloves.variantId),
    { reason: 'Supplier discontinued this box size' },
  );

  return (
    'Variety added: 12 more items, ELD-24A expiring in 20 days, ' +
    'THE-0915 waiting for a cost (PO-DEMO-5), PO-DEMO-4 partly received, ' +
    'CALM-RUN-01 released and CALM-RUN-02 planned, SO-DEMO-3 a draft, ' +
    'SO-DEMO-4 cancelled, SO-DEMO-5 shipped with a draft invoice and a ' +
    'closed RMA, SO-DEMO-6 with a voided invoice, PO-DEMO-6 closed short; ' +
    'ZINC-60 discontinued, Old Mill Herbs retired'
  );
}
