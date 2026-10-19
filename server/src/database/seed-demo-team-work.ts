import type { INestApplicationContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AUDIT_ACTIONS } from '../core/audit/audit-actions';
import { BomsService } from '../modules/boms/boms.service';
import { ExchangeRatesService } from '../modules/costs/exchange-rates.service';
import { InvoiceDraftsService } from '../modules/invoices/invoice-drafts.service';
import { InvoiceIssuingService } from '../modules/invoices/invoice-issuing.service';
import { LocationsService } from '../modules/locations/locations.service';
import { OrderLifecycleService } from '../modules/orders/order-lifecycle.service';
import { OrderReceiptsService } from '../modules/orders/order-receipts.service';
import { ShippingService } from '../modules/orders/shipping.service';
import { PartnerAddressesService } from '../modules/partners/partner-addresses.service';
import { PartnerContactsService } from '../modules/partners/partner-contacts.service';
import { PartnersService } from '../modules/partners/partners.service';
import { PriceListsService } from '../modules/price-lists/price-lists.service';
import { ProductLicencesService } from '../modules/product-licences/product-licences.service';
import { ProductionCloseService } from '../modules/production-orders/production-close.service';
import { ProductionExecutionService } from '../modules/production-orders/production-execution.service';
import { ProductionOrdersService } from '../modules/production-orders/production-orders.service';
import { ProductsService } from '../modules/products/products.service';
import { ReturnAuthorizationReplacementsService } from '../modules/return-authorizations/return-authorization-replacements.service';
import { ReturnAuthorizationsService } from '../modules/return-authorizations/return-authorizations.service';
import { LotsService } from '../modules/stock/lots.service';
import { StockService } from '../modules/stock/stock.service';
import type { Database } from './database.module';
import { lots, productVariants } from './schema';
import type { Audited } from './seed-demo-audit';
import type { DemoOwner, Team } from './seed-demo-team';
import { daysFromNow } from './seed-demo-variety';
import { runInTenantContext } from './tenant-context';

/** What seed-demo.ts made that the team's work builds on. */
export interface TeamAnchors {
  siteId: string;
  shelfId: string;
  supplierId: string;
  usSupplierId: string;
  customerId: string;
  quebecId: string;
  chineseId: string;
  gstId: string;
  exemptId: string;
}

/**
 * The parts of the app the demo did not reach yet, each done by the member
 * whose job it is, so History, People and the audit log show a team at
 * work rather than one account:
 *
 * - 王建国 (warehouse): a second site with zones, an aisle, shelves, a
 *   quarantine and an address; receipts there; a transfer between sites; a
 *   count that found two short and one over; a write-off; a lot whose
 *   expiry turned out to be past, moved to quarantine.
 * - Daniel (operations): a product in three sizes, named in French and
 *   Chinese; equipment; three suppliers, one billing in euros; four
 *   purchases, one of them late and priced from the supplier's list.
 * - Marc-André (production): a recipe for a blend made in-house and one
 *   made from it; a run picked by hand from a later lot; a run made in two
 *   outputs, short of plan; a cancelled run; a draft second version of the
 *   Calm recipe; three licences, one expiring within the week and one
 *   lapsed.
 * - Sarah (sales): contacts, a receiving dock, customer notes; a co-op on
 *   its own price list; a customer in Seattle billed in US dollars; an RMA
 *   resolved by replacement.
 * - 李静 (finance): the invoice drafts.
 * - The Owner: what only an Owner may do, as the permissions say (ADR-016):
 *   exchange rates, price lists, and issuing the invoices.
 *
 * Run after seed-demo-variety.ts and on items of its own, except where it
 * says otherwise below, so the figures the manual checks name are untouched.
 * The documents it numbers come after the others'. Every lot code avoids
 * "2609", which the recall drill searches for.
 */
export async function addTeamWork(
  app: INestApplicationContext,
  db: Database,
  audited: Audited,
  owner: DemoOwner,
  team: Team,
  anchors: TeamAnchors,
): Promise<string> {
  const products = app.get(ProductsService);
  const locations = app.get(LocationsService);
  const licences = app.get(ProductLicencesService);
  const partners = app.get(PartnersService);
  const contacts = app.get(PartnerContactsService);
  const addresses = app.get(PartnerAddressesService);
  const priceLists = app.get(PriceListsService);
  const rates = app.get(ExchangeRatesService);
  const orders = app.get(OrderLifecycleService);
  const receipts = app.get(OrderReceiptsService);
  const shipping = app.get(ShippingService);
  const stock = app.get(StockService);
  const lotsService = app.get(LotsService);
  const bomsService = app.get(BomsService);
  const runs = app.get(ProductionOrdersService);
  const execution = app.get(ProductionExecutionService);
  const closing = app.get(ProductionCloseService);
  const drafts = app.get(InvoiceDraftsService);
  const issuing = app.get(InvoiceIssuingService);
  const rmas = app.get(ReturnAuthorizationsService);
  const replacements = app.get(ReturnAuthorizationReplacementsService);

  const organizationId = owner.organizationId;

  type Order = Awaited<ReturnType<OrderLifecycleService['create']>>;

  /** Work done as one member: services read who from the tenant context. */
  function actingAs<T>(
    userId: string,
    work: (actor: string) => Promise<T>,
  ): Promise<T> {
    return runInTenantContext({ userId, organizationId }, () => work(userId));
  }

  async function variantOf(sku: string): Promise<string> {
    const [row] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          eq(productVariants.sku, sku),
        ),
      );
    if (!row) throw new Error(`The demo has no ${sku}`);
    return row.id;
  }

  async function lotOf(code: string): Promise<string> {
    const [row] = await db
      .select({ id: lots.id })
      .from(lots)
      .where(and(eq(lots.organizationId, organizationId), eq(lots.code, code)));
    if (!row) throw new Error(`The demo has no lot ${code}`);
    return row.id;
  }

  function lineOf(on: Order, variantId: string): string {
    const line = on.lines.find((each) => each.variantId === variantId);
    if (!line) throw new Error(`The order has no line for ${variantId}`);
    return line.id;
  }

  // Each audited write, named once for the route it stands in for.
  const created = (r: { id: string }) => r.id;

  async function location(
    actor: string,
    input: Parameters<LocationsService['create']>[0],
  ) {
    return audited(
      actor,
      { action: AUDIT_ACTIONS.LOCATION_CREATED, type: 'location', id: created },
      () => locations.create(input),
    );
  }

  async function product(
    actor: string,
    input: Parameters<ProductsService['create']>[0],
  ) {
    return audited(
      actor,
      { action: AUDIT_ACTIONS.PRODUCT_CREATED, type: 'product', id: created },
      () => products.create(input),
    );
  }

  async function partner(
    actor: string,
    input: Parameters<PartnersService['create']>[0],
  ) {
    return audited(
      actor,
      { action: AUDIT_ACTIONS.PARTNER_CREATED, type: 'partner', id: created },
      () => partners.create(input),
    );
  }

  async function order(
    actor: string,
    input: Parameters<OrderLifecycleService['create']>[0],
  ) {
    return audited(
      actor,
      { action: AUDIT_ACTIONS.ORDER_CREATED, type: 'order', id: created },
      () => orders.create(input, actor),
    );
  }

  async function setStatus(
    actor: string,
    orderId: string,
    status: 'confirmed' | 'fulfilled',
  ) {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.ORDER_UPDATED,
        type: 'order',
        id: orderId,
        body: { status },
        fields: ['status', 'reference', 'expectedAt', 'deliverToId'],
      },
      () => orders.update(orderId, { status }),
    );
  }

  async function receive(
    actor: string,
    on: Order,
    variantId: string,
    quantity: string,
    toLocationId: string,
    lot?: { code: string; expiresInDays: number },
  ) {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.ORDER_LINE_RECEIVED,
        type: 'order',
        id: on.id,
        body: { quantity },
        fields: ['quantity'],
      },
      () =>
        receipts.receive(
          on.id,
          lineOf(on, variantId),
          {
            toLocationId,
            quantity,
            lot: lot && {
              code: lot.code,
              expiresAt: daysFromNow(lot.expiresInDays),
            },
          },
          actor,
        ),
    );
  }

  async function move(
    actor: string,
    input: Parameters<StockService['record']>[0],
  ) {
    return audited(
      actor,
      {
        action: AUDIT_ACTIONS.STOCK_MOVEMENT_RECORDED,
        type: 'stock_movement',
        id: created,
      },
      () => stock.record(input, actor),
    );
  }

  async function licence(
    actor: string,
    input: Parameters<ProductLicencesService['create']>[0],
  ) {
    return audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCT_LICENCE_CREATED,
        type: 'product_licence',
        id: created,
        body: input,
        fields: ['number', 'authority'],
      },
      () => licences.create(input),
    );
  }

  async function contact(
    actor: string,
    partnerId: string,
    input: Parameters<PartnerContactsService['create']>[1],
  ) {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PARTNER_CONTACT_CREATED,
        type: 'partner',
        id: partnerId,
      },
      () => contacts.create(partnerId, input),
    );
  }

  async function address(
    actor: string,
    partnerId: string,
    input: Parameters<PartnerAddressesService['create']>[1],
  ) {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PARTNER_ADDRESS_CREATED,
        type: 'partner',
        id: partnerId,
      },
      () => addresses.create(partnerId, input),
    );
  }

  async function priceItem(
    listId: string,
    variantId: string,
    unitPrice: string,
  ) {
    await audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.PRICE_LIST_ITEM_SET,
        type: 'price_list',
        id: listId,
        body: { unitPrice },
        fields: ['unitPrice'],
      },
      () => priceLists.setItem(listId, variantId, { unitPrice }),
    );
  }

  async function bom(
    actor: string,
    input: Parameters<BomsService['create']>[0],
  ) {
    const made = await audited(
      actor,
      { action: AUDIT_ACTIONS.BOM_CREATED, type: 'bom', id: created },
      () => bomsService.create(input),
    );
    await audited(
      actor,
      { action: AUDIT_ACTIONS.BOM_PROMOTED, type: 'bom', id: made.id },
      () => bomsService.promote(made.id),
    );
    return made;
  }

  async function run(
    actor: string,
    input: Parameters<ProductionOrdersService['create']>[0],
  ) {
    return audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCTION_ORDER_CREATED,
        type: 'production_order',
        id: created,
      },
      () => runs.create(input),
    );
  }

  async function release(
    actor: string,
    runId: string,
    input: Parameters<ProductionExecutionService['release']>[1],
  ) {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCTION_ORDER_RELEASED,
        type: 'production_order',
        id: runId,
      },
      () => execution.release(runId, input, actor),
    );
  }

  async function output(
    actor: string,
    runId: string,
    input: Parameters<ProductionExecutionService['recordOutput']>[1],
  ) {
    return audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCTION_ORDER_OUTPUT_RECORDED,
        type: 'production_order',
        id: runId,
      },
      () => execution.recordOutput(runId, input, actor),
    );
  }

  async function close(actor: string, runId: string) {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCTION_ORDER_CLOSED,
        type: 'production_order',
        id: runId,
      },
      () => closing.close(runId, {}, actor),
    );
  }

  async function ship(
    actor: string,
    on: Order,
    fromLocationId: string,
    carrier: string,
    lines: { variantId: string; quantity: string }[],
  ) {
    return audited(
      actor,
      { action: AUDIT_ACTIONS.ORDER_SHIPPED, type: 'order', id: on.id },
      () =>
        shipping.ship(
          on.id,
          {
            fromLocationId,
            carrier,
            lines: lines.map((line) => ({
              lineId: lineOf(on, line.variantId),
              quantity: line.quantity,
            })),
          },
          actor,
        ),
    );
  }

  /**
   * The Owner keeps the rates (ADR-048): the last two weeks of US dollars,
   * so Exchange rates reads as a history, and euros for the German
   * supplier, set before its goods arrive so the receipt is valued at once.
   * Today's US rate, 1.37, is seed-demo's and is left alone.
   */
  for (const rate of [
    { currency: 'USD', rateDate: daysFromNow(-14), rate: '1.3590' },
    { currency: 'USD', rateDate: daysFromNow(-7), rate: '1.3650' },
    { currency: 'EUR', rateDate: daysFromNow(-7), rate: '1.4980' },
    { currency: 'EUR', rateDate: daysFromNow(0), rate: '1.5120' },
  ]) {
    await audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.EXCHANGE_RATE_SET,
        type: 'exchange_rate',
        id: created,
        body: rate,
        fields: ['currency', 'rateDate', 'rate'],
      },
      () => rates.set(rate),
    );
  }

  /**
   * Marc-André keeps the registrations. Sleep's, with no expiry, as an NPN
   * has none; an export certificate expiring in six days, inside the last
   * reminder (ADR-064); and the site licence, lapsed ten days ago with its
   * renewal filed, so Home's Licences card has one overdue.
   */
  const sleepNpn = await actingAs(team.marc.id, async (actor) => {
    const npn = await licence(actor, {
      number: '80091234',
      authority: 'Health Canada',
      issuedAt: daysFromNow(-120),
      notes: 'Demo data — not a real registration',
    });
    await licence(actor, {
      number: 'EXP-2026-0619',
      authority: 'CFIA export certificate',
      issuedAt: daysFromNow(-359),
      expiresAt: daysFromNow(6),
      notes: 'Demo data — renewal due this week',
    });
    await licence(actor, {
      number: '300456',
      authority: 'Health Canada site licence',
      issuedAt: daysFromNow(-1105),
      expiresAt: daysFromNow(-10),
      notes: 'Demo data — renewal filed, awaiting the new licence',
    });
    return npn;
  });

  /**
   * 王建国 sets up the Richmond warehouse, a site of its own with an
   * address, and every kind of location below it (ADR-024): zones, an
   * aisle, shelves and a fridge, where Main has only bins. Stock sits on
   * the shelves, the leaves.
   * Quarantine holds stock nobody may send or use (ADR-042), marked so
   * once made, as the screen does it.
   */
  const richmond = await actingAs(team.jianguo.id, async (actor) => {
    const site = await location(actor, {
      type: 'site',
      name: 'Richmond warehouse',
      code: 'RICH',
    });
    const siteAddress = {
      line1: '13511 Crestwood Pl, Unit 4',
      city: 'Richmond',
      region: 'BC',
      postalCode: 'V6V 2E9',
      country: 'CA',
    };
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.LOCATION_UPDATED,
        type: 'location',
        id: site.id,
        body: siteAddress,
        fields: ['line1', 'line2', 'city', 'region', 'postalCode', 'country'],
      },
      () => locations.setAddress(site.id, siteAddress),
    );

    const ambient = await location(actor, {
      type: 'zone',
      name: 'Ambient',
      code: 'AMB',
      parentId: site.id,
    });
    const aisle = await location(actor, {
      type: 'aisle',
      name: 'Aisle 1',
      code: 'A1',
      parentId: ambient.id,
    });
    const shelfA = await location(actor, {
      type: 'shelf',
      name: 'Shelf 1-A',
      code: '1A',
      parentId: aisle.id,
    });
    const shelfB = await location(actor, {
      type: 'shelf',
      name: 'Shelf 1-B',
      code: '1B',
      parentId: aisle.id,
    });
    const cold = await location(actor, {
      type: 'zone',
      name: 'Cold',
      code: 'COLD',
      parentId: site.id,
    });
    await location(actor, {
      type: 'bin',
      name: 'Fridge 1',
      code: 'F1',
      parentId: cold.id,
    });
    const quarantine = await location(actor, {
      type: 'bin',
      name: 'Quarantine',
      code: 'QUAR',
      parentId: site.id,
    });
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.LOCATION_UPDATED,
        type: 'location',
        id: quarantine.id,
      },
      () => locations.update(quarantine.id, { isAvailable: false }),
    );
    const cage = await location(actor, {
      type: 'bin',
      name: 'Equipment cage',
      code: 'CAGE',
      parentId: site.id,
    });
    return {
      shelfA: shelfA.id,
      shelfB: shelfB.id,
      quarantine: quarantine.id,
      cage: cage.id,
    };
  });

  /**
   * Daniel adds what the company buys in. Magnesium capsules in three
   * sizes, one product with three variants (ADR-023), each with its own
   * weight and case, named in French and Chinese down to the size. The
   * materials for the Sleep blend, the amber bottle it goes into, a
   * capsule filler (equipment: tracked and located, never sold), and the
   * suppliers.
   */
  const catalogue = await actingAs(team.daniel.id, async (actor) => {
    const sizes = [
      {
        sku: 'MAGCAP-60',
        name: '60 capsules',
        zh: '60 粒',
        grams: 95,
        case: 24,
      },
      {
        sku: 'MAGCAP-120',
        name: '120 capsules',
        zh: '120 粒',
        grams: 160,
        case: 24,
      },
      {
        sku: 'MAGCAP-240',
        name: '240 capsules',
        zh: '240 粒',
        grams: 290,
        case: 12,
      },
    ];
    const sizeVariant = (size: (typeof sizes)[number]) => ({
      sku: size.sku,
      name: size.name,
      unitOfMeasure: 'each',
      tracksLots: true,
      weightGrams: size.grams,
      caseQuantity: size.case,
    });
    const [first, ...more] = sizes;
    const magnesium = await product(actor, {
      type: 'good',
      name: 'Magnesium bisglycinate capsules',
      description:
        '150 mg elemental magnesium per capsule, as bisglycinate. Vegan.',
      variant: sizeVariant(first),
    });
    const variants = [{ ...first, id: magnesium.variants[0].id }];
    for (const size of more) {
      const added = await audited(
        actor,
        {
          action: AUDIT_ACTIONS.PRODUCT_VARIANT_ADDED,
          type: 'product',
          id: magnesium.id,
          body: { sku: size.sku },
          fields: ['sku'],
        },
        () => products.addVariant(magnesium.id, sizeVariant(size)),
      );
      variants.push({ ...size, id: added.id });
    }

    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCT_UPDATED,
        type: 'product',
        id: magnesium.id,
      },
      () =>
        products.setTranslations(magnesium.id, {
          translations: [
            {
              locale: 'fr-CA',
              name: 'Bisglycinate de magnésium, capsules',
              description:
                '150 mg de magnésium élémentaire par capsule, sous forme de bisglycinate. Végane.',
            },
            {
              locale: 'zh-Hans',
              name: '甘氨酸镁胶囊',
              description: '每粒含元素镁 150 毫克，甘氨酸镁形式。纯素。',
            },
          ],
        }),
    );
    // French writes each size as English does.
    for (const variant of variants) {
      await audited(
        actor,
        {
          action: AUDIT_ACTIONS.PRODUCT_VARIANT_UPDATED,
          type: 'product',
          id: magnesium.id,
        },
        () =>
          products.setVariantTranslations(magnesium.id, variant.id, {
            translations: [
              { locale: 'fr-CA', name: variant.name },
              { locale: 'zh-Hans', name: variant.zh },
            ],
          }),
      );
    }

    const vitaminC = await product(actor, {
      type: 'good',
      name: 'Vitamin C 500 mg, 100 tablets',
      variant: { sku: 'VITC-100', unitOfMeasure: 'each', tracksLots: true },
    });
    const chamomile = await product(actor, {
      type: 'material',
      name: 'Chamomile flower extract, 4:1',
      variant: { sku: 'CHAMOMILE-EXT', unitOfMeasure: 'kg', tracksLots: true },
    });
    const melatonin = await product(actor, {
      type: 'material',
      name: 'Melatonin',
      variant: { sku: 'MELATONIN', unitOfMeasure: 'kg', tracksLots: true },
    });
    const amberBottle = await product(actor, {
      type: 'packaging',
      name: '60ct amber bottle',
      variant: { sku: 'BOTTLE-A60', unitOfMeasure: 'each' },
    });
    const filler = await product(actor, {
      type: 'equipment',
      name: 'Capsule filling machine, semi-automatic',
      description: 'Serial CF-2210-0457. Awaiting installation in Mixing.',
      variant: { sku: 'EQ-CAPFILL-01', unitOfMeasure: 'each' },
    });

    const weber = await partner(actor, {
      name: 'Kräuterhaus Weber GmbH',
      code: 'WEBER',
      taxId: 'DE 812 345 678',
    });
    const lakeshore = await partner(actor, {
      name: 'Lakeshore Packaging',
      code: 'LAKESHORE',
    });
    await contact(actor, lakeshore.id, {
      name: 'Priya Nair',
      role: 'Account manager',
      email: 'priya.nair@lakeshore.example',
      phone: '905-555-0134',
      isPrimary: true,
    });
    const precision = await partner(actor, {
      name: 'Precision Encapsulation Ltd.',
      code: 'PRECISION',
    });

    return {
      magcap60: variants[0].id,
      magcap120: variants[1].id,
      magcap240: variants[2].id,
      vitaminC: vitaminC.variants[0].id,
      chamomile: chamomile.variants[0].id,
      melatonin: melatonin.variants[0].id,
      amberBottle: amberBottle.variants[0].id,
      filler: filler.variants[0].id,
      weberId: weber.id,
      lakeshoreId: lakeshore.id,
      precisionId: precision.id,
    };
  });

  const carton = await variantOf('CARTON-24');

  /**
   * Price lists are the Owner's (ADR-049): Lakeshore's, so purchases from
   * them are priced as they are added; one a co-op buys from, set on that
   * customer below; and last year's retail list, retired, so the Price
   * lists page shows how that reads.
   */
  async function priceList(input: Parameters<PriceListsService['create']>[0]) {
    return audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.PRICE_LIST_CREATED,
        type: 'price_list',
        id: created,
        body: input,
        fields: ['name', 'direction', 'currency'],
      },
      () => priceLists.create(input),
    );
  }

  const lakeshoreList = await priceList({
    name: 'Lakeshore Packaging 2026',
    direction: 'purchase',
    currency: 'CAD',
  });
  await priceItem(lakeshoreList.id, catalogue.amberBottle, '0.3800');
  await priceItem(lakeshoreList.id, carton, '1.7500');

  const coopList = await priceList({
    name: 'Co-op members CAD',
    direction: 'sale',
    currency: 'CAD',
  });
  await priceItem(coopList.id, catalogue.magcap60, '14.4900');
  await priceItem(coopList.id, catalogue.magcap120, '24.9900');
  await priceItem(coopList.id, catalogue.magcap240, '44.9900');
  await priceItem(coopList.id, catalogue.vitaminC, '9.9900');

  const retired = await priceList({
    name: 'Retail CAD 2025',
    direction: 'sale',
    currency: 'CAD',
  });
  await priceItem(retired.id, catalogue.vitaminC, '12.9900');
  await audited(
    owner.userId,
    {
      action: AUDIT_ACTIONS.PRICE_LIST_UPDATED,
      type: 'price_list',
      id: retired.id,
      body: { isActive: false },
      fields: ['name', 'isActive'],
    },
    () => priceLists.update(retired.id, { isActive: false }),
  );

  /**
   * Daniel's purchases. PO-DEMO-7 is in euros, valued at the day's rate on
   * receipt (ADR-048). PO-DEMO-9 is due three days ago and not here yet,
   * so Home's To receive card has a late one, and its lines carry no price:
   * they take Lakeshore's list.
   */
  const purchases = await actingAs(team.daniel.id, async (actor) => {
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PARTNER_UPDATED,
        type: 'partner',
        id: catalogue.lakeshoreId,
      },
      () =>
        partners.update(catalogue.lakeshoreId, {
          purchasePriceListId: lakeshoreList.id,
        }),
    );

    const herbs = await order(actor, {
      partnerId: catalogue.weberId,
      direction: 'purchase',
      reference: 'PO-DEMO-7',
      lines: [
        {
          variantId: catalogue.chamomile,
          quantityOrdered: '20',
          unitPrice: '41.0000',
          currency: 'EUR',
        },
        {
          variantId: catalogue.melatonin,
          quantityOrdered: '1',
          unitPrice: '310.0000',
          currency: 'EUR',
        },
      ],
    });
    await setStatus(actor, herbs.id, 'confirmed');

    const usd = (variantId: string, quantity: string, unitPrice: string) => ({
      variantId,
      quantityOrdered: quantity,
      unitPrice,
      currency: 'USD',
    });
    const bought = await order(actor, {
      partnerId: anchors.usSupplierId,
      direction: 'purchase',
      reference: 'PO-DEMO-8',
      lines: [
        usd(catalogue.magcap60, '144', '7.1000'),
        usd(catalogue.magcap120, '96', '12.4000'),
        usd(catalogue.magcap240, '48', '21.9000'),
        usd(catalogue.vitaminC, '96', '4.2000'),
      ],
    });
    await setStatus(actor, bought.id, 'confirmed');

    const late = await order(actor, {
      partnerId: catalogue.lakeshoreId,
      direction: 'purchase',
      reference: 'PO-DEMO-9',
      expectedAt: daysFromNow(-3),
      lines: [
        { variantId: catalogue.amberBottle, quantityOrdered: '3000' },
        { variantId: carton, quantityOrdered: '200' },
      ],
    });
    await setStatus(actor, late.id, 'confirmed');

    const machine = await order(actor, {
      partnerId: catalogue.precisionId,
      direction: 'purchase',
      reference: 'PO-DEMO-10',
      lines: [
        {
          variantId: catalogue.filler,
          quantityOrdered: '1',
          unitPrice: '18500.0000',
          currency: 'CAD',
        },
      ],
    });
    await setStatus(actor, machine.id, 'confirmed');

    return { herbs, bought, machine };
  });

  /**
   * 王建国 receives. The herbs go to Main, where Mixing draws from; the
   * capsules and vitamin C to Richmond; the machine to the cage. Then a
   * day on the floor: some vitamin D3 moved to Richmond, a count that
   * found two omega-3 short and a box of gloves over, two leaking
   * elderberry bottles written off, and a vitamin C lot whose supplier
   * certificate shows it expired four days ago, corrected and moved to
   * quarantine, so Home's Expiring card has a late one.
   *
   * The D3, omega-3, gloves and elderberry are seed-demo-variety's; none
   * of them is a lot or a figure the manual checks name (ELD-24A stays as
   * it was).
   */
  await actingAs(team.jianguo.id, async (actor) => {
    const { herbs, bought, machine } = purchases;

    await receive(actor, herbs, catalogue.chamomile, '10', anchors.shelfId, {
      code: 'CHA-0410',
      expiresInDays: 300,
    });
    await receive(actor, herbs, catalogue.chamomile, '10', anchors.shelfId, {
      code: 'CHA-0522',
      expiresInDays: 500,
    });
    await receive(actor, herbs, catalogue.melatonin, '1', anchors.shelfId, {
      code: 'MEL-0605',
      expiresInDays: 540,
    });
    await setStatus(actor, herbs.id, 'fulfilled');

    const capsules = [
      { variantId: catalogue.magcap60, quantity: '144', code: 'MC60-0815' },
      { variantId: catalogue.magcap120, quantity: '96', code: 'MC120-0815' },
      { variantId: catalogue.magcap240, quantity: '48', code: 'MC240-0815' },
    ];
    for (const each of capsules) {
      await receive(
        actor,
        bought,
        each.variantId,
        each.quantity,
        richmond.shelfA,
        { code: each.code, expiresInDays: 690 },
      );
    }
    await receive(actor, bought, catalogue.vitaminC, '48', richmond.shelfA, {
      code: 'VC-0301',
      expiresInDays: 200,
    });
    await receive(actor, bought, catalogue.vitaminC, '48', richmond.shelfA, {
      code: 'VC-0402',
      expiresInDays: 420,
    });
    await setStatus(actor, bought.id, 'fulfilled');

    await receive(actor, machine, catalogue.filler, '1', richmond.cage);
    await setStatus(actor, machine.id, 'fulfilled');

    await move(actor, {
      variantId: await variantOf('D3-1000-120'),
      lotId: await lotOf('D3-B02'),
      fromLocationId: anchors.shelfId,
      toLocationId: richmond.shelfB,
      quantity: '40',
      reason: 'transfer',
      note: 'Stocking Richmond for the island customers',
    });

    await move(actor, {
      variantId: await variantOf('OMEGA3-90'),
      lotId: await lotOf('OMG-0417'),
      fromLocationId: anchors.shelfId,
      quantity: '2',
      reason: 'adjustment',
      reasonDetail: 'miscount',
      note: 'Cycle count: 2 short against the shelf',
    });
    await move(actor, {
      variantId: await variantOf('GLOVES-100'),
      toLocationId: anchors.shelfId,
      quantity: '1',
      reason: 'adjustment',
      reasonDetail: 'miscount',
      note: 'Cycle count: one box found behind the cartons',
    });
    await move(actor, {
      variantId: await variantOf('ELDER-250'),
      lotId: await lotOf('ELD-25B'),
      fromLocationId: anchors.shelfId,
      quantity: '2',
      reason: 'adjustment',
      reasonDetail: 'damaged',
      note: 'Leaking caps, found at the count',
    });

    const expired = await lotOf('VC-0301');
    await audited(
      actor,
      { action: AUDIT_ACTIONS.STOCK_LOT_UPDATED, type: 'lot', id: expired },
      () => lotsService.updateLot(expired, { expiresAt: daysFromNow(-4) }),
    );
    await move(actor, {
      variantId: catalogue.vitaminC,
      lotId: expired,
      fromLocationId: richmond.shelfA,
      toLocationId: richmond.quarantine,
      quantity: '48',
      reason: 'transfer',
      note: 'Expired per the supplier certificate; held for their credit',
    });
  });

  /**
   * Marc-André's production. Sleep is made in two steps, a blend made
   * in-house and the capsules made from it (ADR-029), so a recall from
   * either chamomile lot reaches the finished bottles (ADR-044).
   *
   * The blend run is picked by hand from the later chamomile lot, CHA-0522
   * (ADR-039): QA asked to keep the earlier one for a stability test. The
   * capsule run reports output twice, 450 and 520, and closes at 970 of
   * 1000, so it has an output variance (ADR-032). The bottles are
   * supplied by the contract filler, so the run issues only the blend
   * (ADR-030).
   *
   * Then two things that are not runs: a draft second version of the Calm
   * recipe with more magnesium, not yet promoted, and a run raised twice
   * by mistake and cancelled.
   */
  await actingAs(team.marc.id, async (actor) => {
    const mixing = await location(actor, {
      type: 'bin',
      name: 'Mixing suite',
      code: 'MIXING',
      parentId: anchors.siteId,
    });
    const blend = await product(actor, {
      type: 'material',
      name: 'Sleep blend',
      variant: { sku: 'SLEEP-BLEND', unitOfMeasure: 'kg', tracksLots: true },
    });
    const sleep = await product(actor, {
      type: 'good',
      name: 'Sleep 60ct',
      variant: { sku: 'SLEEP-60CT', unitOfMeasure: 'each', tracksLots: true },
    });
    const blendVariant = blend.variants[0].id;
    const sleepVariant = sleep.variants[0].id;

    const blendRecipe = await bom(actor, {
      outputVariantId: blendVariant,
      outputQuantity: '10',
      lines: [
        { componentVariantId: catalogue.chamomile, quantity: '9.6' },
        { componentVariantId: catalogue.melatonin, quantity: '0.4' },
      ],
    });
    const sleepRecipe = await bom(actor, {
      outputVariantId: sleepVariant,
      outputQuantity: '1000',
      licenceId: sleepNpn.id,
      lines: [
        { componentVariantId: blendVariant, quantity: '6' },
        {
          componentVariantId: catalogue.amberBottle,
          quantity: '1000',
          supplyType: 'external',
        },
      ],
    });

    const blendRun = await run(actor, {
      outputVariantId: blendVariant,
      bomId: blendRecipe.id,
      locationId: mixing.id,
      quantityPlanned: '10',
      reference: 'SLEEP-BLEND-01',
    });
    await release(actor, blendRun.id, {
      sourceLocationId: anchors.shelfId,
      lots: [
        {
          componentVariantId: catalogue.chamomile,
          lots: [{ lotId: await lotOf('CHA-0522'), quantity: '9.6' }],
        },
      ],
    });
    await output(actor, blendRun.id, {
      quantity: '10',
      lot: { code: 'SLB-001', expiresAt: daysFromNow(365) },
    });
    await close(actor, blendRun.id);

    const sleepRun = await run(actor, {
      outputVariantId: sleepVariant,
      bomId: sleepRecipe.id,
      locationId: mixing.id,
      quantityPlanned: '1000',
      reference: 'SLEEP-60-01',
    });
    // The blend is already in Mixing, where the run is: issued in place.
    await release(actor, sleepRun.id, { sourceLocationId: mixing.id });
    const first = await output(actor, sleepRun.id, {
      quantity: '450',
      lot: { code: 'SLP-001', expiresAt: daysFromNow(730) },
    });
    await output(actor, sleepRun.id, {
      quantity: '520',
      lotId: first.lotId ?? undefined,
    });
    await close(actor, sleepRun.id);

    const calmVariant = await variantOf('CALM-90CT');
    const [calm] = await bomsService.list({
      outputVariantId: calmVariant,
      status: 'active',
    });
    if (!calm) throw new Error('The demo has no active Calm recipe');

    const calmV2 = await audited(
      actor,
      { action: AUDIT_ACTIONS.BOM_CREATED, type: 'bom', id: created },
      () => bomsService.duplicate(calm.id),
    );
    const detail = await bomsService.findDetail(calmV2.id);
    const magnesiumGly = await variantOf('MAG-GLY');
    const line = detail.lines.find(
      (each) => each.componentVariantId === magnesiumGly,
    );
    if (!line) throw new Error('The Calm recipe has no magnesium line');
    await audited(
      actor,
      { action: AUDIT_ACTIONS.BOM_LINE_UPDATED, type: 'bom', id: calmV2.id },
      () => bomsService.updateLine(calmV2.id, line.id, { quantity: '22' }),
    );

    const duplicate = await run(actor, {
      outputVariantId: calmVariant,
      bomId: calm.id,
      locationId: mixing.id,
      quantityPlanned: '500',
      reference: 'CALM-RUN-03',
    });
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PRODUCTION_ORDER_CANCELLED,
        type: 'production_order',
        id: duplicate.id,
      },
      () =>
        runs.cancel(duplicate.id, {
          reason: 'Raised twice by mistake; CALM-RUN-02 covers it',
        }),
    );
  });

  /**
   * Sarah's customers. Contacts for the main ones, each in their own
   * language; Northside's receiving dock beside its billing address, and
   * a note for the drivers. Then two new customers: a co-op on its own
   * price list, whose order takes its prices from it (ADR-049), and a
   * grocer in Seattle, sold to in US dollars and invoiced without tax.
   */
  const sales = await actingAs(team.sarah.id, async (actor) => {
    await contact(actor, anchors.customerId, {
      name: 'Grace Liang',
      role: 'Buyer',
      email: 'grace.liang@northside.example',
      phone: '250-555-0118',
      isPrimary: true,
    });
    await contact(actor, anchors.customerId, {
      name: 'Dana Whitfield',
      role: 'Accounts payable',
      email: 'ap@northside.example',
    });
    await contact(actor, anchors.quebecId, {
      name: 'Isabelle Fortin',
      role: 'Acheteuse',
      email: 'i.fortin@pharmacie-saint-laurent.example',
      phone: '514-555-0172',
      isPrimary: true,
    });
    await contact(actor, anchors.chineseId, {
      name: '陈美玲',
      role: '采购经理',
      phone: '604-555-0166',
      isPrimary: true,
    });
    await contact(actor, anchors.supplierId, {
      name: 'Owen Price',
      role: 'Sales representative',
      email: 'owen@cascade-botanicals.example',
      isPrimary: true,
    });

    await address(actor, anchors.customerId, {
      label: 'Receiving dock',
      line1: '2250 Douglas St, Bay 3',
      city: 'Victoria',
      region: 'BC',
      postalCode: 'V8T 4M1',
      country: 'CA',
      isShipping: true,
    });
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.PARTNER_UPDATED,
        type: 'partner',
        id: anchors.customerId,
      },
      () =>
        partners.update(anchors.customerId, {
          notes:
            'Receiving Monday to Thursday, 8 am to 2 pm. Call the dock before sending a pallet.',
        }),
    );

    const kits = await partner(actor, {
      name: 'Kits Wellness Co-op',
      code: 'KITS',
    });
    await address(actor, kits.id, {
      label: 'Head office',
      line1: '2685 W 4th Ave',
      city: 'Vancouver',
      region: 'BC',
      postalCode: 'V6K 1P8',
      country: 'CA',
      isBilling: true,
      isShipping: true,
      isDefault: true,
    });
    await audited(
      actor,
      { action: AUDIT_ACTIONS.PARTNER_UPDATED, type: 'partner', id: kits.id },
      () => partners.update(kits.id, { salePriceListId: coopList.id }),
    );

    const cascadia = await partner(actor, {
      name: 'Cascadia Natural Grocers',
      code: 'CASCADIA',
    });
    await address(actor, cascadia.id, {
      label: 'Accounts payable',
      line1: '1520 4th Ave',
      city: 'Seattle',
      region: 'WA',
      postalCode: '98101',
      country: 'US',
      isBilling: true,
      isShipping: true,
      isDefault: true,
    });

    const coopOrder = await order(actor, {
      partnerId: kits.id,
      direction: 'sale',
      reference: 'SO-DEMO-7',
      lines: [
        { variantId: catalogue.magcap60, quantityOrdered: '48' },
        { variantId: catalogue.magcap120, quantityOrdered: '24' },
      ],
    });
    await setStatus(actor, coopOrder.id, 'confirmed');

    const grocer = await order(actor, {
      partnerId: cascadia.id,
      direction: 'sale',
      reference: 'SO-DEMO-8',
      lines: [
        {
          variantId: catalogue.vitaminC,
          quantityOrdered: '24',
          unitPrice: '7.5000',
          currency: 'USD',
        },
        {
          variantId: catalogue.magcap120,
          quantityOrdered: '12',
          unitPrice: '18.0000',
          currency: 'USD',
        },
      ],
    });
    await setStatus(actor, grocer.id, 'confirmed');

    return { coopOrder, grocer };
  });

  // 王建国 ships both from Richmond, each lot earliest expiry first.
  const shipments = await actingAs(team.jianguo.id, async (actor) => {
    const coop = await ship(
      actor,
      sales.coopOrder,
      richmond.shelfA,
      'Purolator',
      [
        { variantId: catalogue.magcap60, quantity: '48' },
        { variantId: catalogue.magcap120, quantity: '24' },
      ],
    );
    const usa = await ship(actor, sales.grocer, richmond.shelfA, 'UPS', [
      { variantId: catalogue.vitaminC, quantity: '24' },
      { variantId: catalogue.magcap120, quantity: '12' },
    ]);
    return { coop: coop.id, usa: usa.id };
  });

  /**
   * 李静 drafts the two invoices: GST for the co-op, and Exempt for the
   * export, in the order's US dollars. Issuing is the Owner's (ADR-046).
   */
  const draftIds = await actingAs(team.lijing.id, async (actor) => {
    const ids: string[] = [];
    for (const bill of [
      { shipmentId: shipments.coop, taxCodeId: anchors.gstId },
      { shipmentId: shipments.usa, taxCodeId: anchors.exemptId },
    ]) {
      const draft = await audited(
        actor,
        {
          action: AUDIT_ACTIONS.INVOICE_CREATED,
          type: 'invoice',
          id: created,
          body: bill,
          fields: ['shipmentId', 'taxCodeId'],
        },
        () => drafts.createDraft(bill, actor),
      );
      const due = { dueDate: daysFromNow(30) };
      await audited(
        actor,
        {
          action: AUDIT_ACTIONS.INVOICE_UPDATED,
          type: 'invoice',
          id: draft.id,
          body: due,
          fields: ['dueDate', 'taxCodeId'],
        },
        () => drafts.update(draft.id, due),
      );
      ids.push(draft.id);
    }
    return ids;
  });

  const numbers: (string | null)[] = [];
  for (const draftId of draftIds) {
    const issue = { invoiceDate: daysFromNow(0) };
    const invoice = await audited(
      owner.userId,
      {
        action: AUDIT_ACTIONS.INVOICE_ISSUED,
        type: 'invoice',
        id: draftId,
        body: issue,
        fields: ['invoiceDate'],
      },
      () => issuing.issue(draftId, issue, owner.userId),
    );
    numbers.push(invoice.number);
  }

  // Shipped in full and billed: Sarah closes both orders.
  await actingAs(team.sarah.id, async (actor) => {
    await setStatus(actor, sales.coopOrder.id, 'fulfilled');
    await setStatus(actor, sales.grocer.id, 'fulfilled');
  });

  /**
   * Two of the co-op's bottles arrived crushed. Sarah raises an RMA to
   * replace them (ADR-047) and the replacement order, a draft at no
   * charge, so the Returns list has one open, waiting for the goods, and
   * the replace path has an example.
   */
  const rma = await actingAs(team.sarah.id, async (actor) => {
    const input = {
      orderId: sales.coopOrder.id,
      invoiceId: draftIds[0],
      reason: 'Two bottles crushed in transit',
      lines: [
        {
          lineId: lineOf(sales.coopOrder, catalogue.magcap60),
          quantity: '2',
          resolution: 'replace' as const,
        },
      ],
    };
    const made = await audited(
      actor,
      {
        action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_CREATED,
        type: 'return_authorization',
        id: created,
        body: input,
        fields: [
          'orderId',
          'invoiceId',
          'expectsGoods',
          'sendBackToId',
          'lines',
        ],
      },
      () => rmas.create(input, actor),
    );
    await audited(
      actor,
      {
        action: AUDIT_ACTIONS.RETURN_AUTHORIZATION_REPLACEMENT_RAISED,
        type: 'return_authorization',
        id: made.id,
      },
      () => replacements.raiseReplacement(made.id, actor),
    );
    return made;
  });

  return [
    'Team work added: Richmond warehouse with zones, shelves and a quarantine',
    'MAGCAP in three sizes',
    'PO-DEMO-7 in euros, PO-DEMO-9 late, a capsule filler in the cage',
    'VC-0301 expired and quarantined',
    'SLEEP-BLEND-01 from hand-picked CHA-0522',
    'SLEEP-60-01 made 450 + 520 of 1000',
    'Calm v2 a draft, CALM-RUN-03 cancelled',
    'licences expiring in 6 days and lapsed',
    `SO-DEMO-7 from Co-op members CAD and SO-DEMO-8 in USD, invoiced as ${numbers.join(' and ')}`,
    `${rma.number} to replace two bottles`,
    'Retail CAD 2025 retired',
  ].join('; ');
}
