import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { and, eq } from 'drizzle-orm';

import { AppModule } from '../app.module';
import { AuthService } from '../core/auth/auth.service';
import { OrganizationsService } from '../core/organizations/organizations.service';
import { BomsService } from '../modules/boms/boms.service';
import { InvoicesService } from '../modules/invoices/invoices.service';
import { LocationsService } from '../modules/locations/locations.service';
import { OrdersService } from '../modules/orders/orders.service';
import { ReturnsService } from '../modules/orders/returns.service';
import { ShipmentsService } from '../modules/orders/shipments.service';
import { PartnerAddressesService } from '../modules/partners/partner-addresses.service';
import { PartnersService } from '../modules/partners/partners.service';
import { ProductLicencesService } from '../modules/product-licences/product-licences.service';
import { ProductionOrdersService } from '../modules/production-orders/production-orders.service';
import { ProductsService } from '../modules/products/products.service';
import { StockService } from '../modules/stock/stock.service';
import { TaxCodesService } from '../modules/tax-codes/tax-codes.service';
import { type Database, UNSAFE_GLOBAL_DB } from './database.module';
import { lots, memberships, productVariants, users } from './schema';
import { runInTenantContext } from './tenant-context';

/**
 * One product, made once, through the same services the API calls.
 *
 * Not part of `seed`, deliberately. That one runs on every deploy, production
 * included, and its job is the permission vocabulary — demo products written
 * there would reach production on the next push and never leave. This is a
 * separate command nobody wires into a build.
 *
 * Through the services rather than raw inserts, so it exercises the validation
 * the UI does: a recipe that scales, a lot-tracked component issued by lot, a
 * consumption over plan that tops up. That makes it a smoke test as much as a
 * fixture — if this script runs clean against an empty database, the make-it
 * path works end to end.
 *
 * Usage, from `server/`:
 *
 *     npm run seed:demo
 *     npm run seed:demo -- someone@example.com
 *
 * With no argument it registers a fresh account and organization — through
 * AuthService, as the Register page does — and prints how to sign in. Every
 * run gets its own organization, so nothing collides and there is nothing to
 * clean up first.
 *
 * With an email, it seeds that existing account's organization instead, and
 * refuses up front if the demo is already there, rather than failing partway
 * on the first duplicate.
 */

/** Fixed rather than random, so a demo account can always be signed into. */
const DEMO_PASSWORD = 'demo-password-2026';

async function seedDemo(): Promise<void> {
  const logger = new Logger('SeedDemo');

  if (process.env.NODE_ENV === 'production') {
    logger.error('Refusing to write demo data to a production database');
    process.exitCode = 1;
    return;
  }

  const requested = process.argv[2]?.trim().toLowerCase();

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const db = app.get<Database>(UNSAFE_GLOBAL_DB);

    const account = requested
      ? await existingAccount(db, requested)
      : await freshAccount(app.get(AuthService));

    if (!account) {
      logger.error(
        `No account for ${requested} — register it, or run without an email`,
      );
      process.exitCode = 1;
      return;
    }

    /**
     * Checked before anything is written. Each step would refuse a duplicate
     * on its own, but the first refusal would come after nothing — or, with a
     * different order of steps, after something — and a clear "already there"
     * is worth one query.
     */
    const [seeded] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, account.organizationId),
          eq(productVariants.sku, 'FOCUS-60CT'),
        ),
      );

    if (seeded) {
      logger.error(
        `${account.email}'s organization already has the demo. Run without an email for a fresh one.`,
      );
      process.exitCode = 1;
      return;
    }

    const email = account.email;

    const products = app.get(ProductsService);
    const locations = app.get(LocationsService);
    const licences = app.get(ProductLicencesService);
    const partners = app.get(PartnersService);
    const orders = app.get(OrdersService);
    const boms = app.get(BomsService);
    const runs = app.get(ProductionOrdersService);
    const shipments = app.get(ShipmentsService);
    const returns = app.get(ReturnsService);
    const stock = app.get(StockService);
    const organization = app.get(OrganizationsService);
    const partnerAddresses = app.get(PartnerAddressesService);
    const taxCodes = app.get(TaxCodesService);
    const invoices = app.get(InvoicesService);

    // Every service below resolves its tenant from here, the same way a
    // request does through the auth guard (ADR-003).
    await runInTenantContext(
      { userId: account.userId, organizationId: account.organizationId },
      async () => {
        const actor = account.userId;

        // An NPN: issued on a date, and valid while the product is marketed
        // and compliant, so no expiry. Leaving it blank is the realistic
        // shape, not an omission.
        const licence = await licences.create({
          number: '80012345',
          authority: 'Health Canada',
          issuedAt: daysFromNow(-400),
          notes: 'Demo data — not a real registration',
        });

        // One that does expire, so the Licences page shows the warning state
        // rather than a column of "Current". Not put on a recipe: it stands
        // in for an export certificate, which is paperwork beside the
        // product, not the registration it is made under.
        await licences.create({
          number: 'EXP-2026-0412',
          authority: 'CFIA export certificate',
          issuedAt: daysFromNow(-335),
          expiresAt: daysFromNow(30),
          notes: 'Demo data — shows how an expiring registration reads',
        });

        const site = await locations.create({ type: 'site', name: 'Main' });
        const shelf = await locations.create({
          type: 'bin',
          name: 'Shelf',
          code: 'SHELF',
          parentId: site.id,
        });
        const blending = await locations.create({
          type: 'bin',
          name: 'Blending room',
          code: 'BLENDING',
          parentId: site.id,
        });

        /**
         * Two bins that hold stock nobody may send (ADR-042): retained
         * samples of each finished lot, which GMP requires for supplements,
         * and returns waiting to be checked. Marked unavailable once made,
         * since that is a separate edit in the UI too.
         */
        const retention = await locations.create({
          type: 'bin',
          name: 'Retention',
          code: 'RETAIN',
          parentId: site.id,
        });
        await locations.update(retention.id, { isAvailable: false });

        const returnsBin = await locations.create({
          type: 'bin',
          name: 'Returns',
          code: 'RETURNS',
          parentId: site.id,
        });
        await locations.update(returnsBin.id, { isAvailable: false });

        const finished = await products.create({
          type: 'good',
          name: 'Focus 60ct',
          variant: {
            sku: 'FOCUS-60CT',
            unitOfMeasure: 'each',
            tracksLots: true,
          },
        });

        const blend = await products.create({
          type: 'material',
          name: 'Focus blend',
          variant: {
            sku: 'BLEND-FOCUS',
            unitOfMeasure: 'kg',
            tracksLots: true,
          },
        });

        const bottle = await products.create({
          type: 'packaging',
          name: '60ct bottle',
          variant: { sku: 'BOTTLE-60', unitOfMeasure: 'each' },
        });

        const supplier = await partners.create({
          name: 'Cascade Botanicals',
          code: 'CASC',
        });

        // Bought, confirmed, received into a lot: the state a run starts from.
        const order = await orders.create(
          {
            partnerId: supplier.id,
            direction: 'purchase',
            reference: 'PO-DEMO-1',
            lines: [
              {
                variantId: blend.variants[0].id,
                quantityOrdered: '50',
                unitPrice: '38.0000',
                currency: 'CAD',
              },
            ],
          },
          actor,
        );

        await orders.update(order.id, { status: 'confirmed' });

        await orders.receive(
          order.id,
          order.lines[0].id,
          {
            toLocationId: shelf.id,
            quantity: '50',
            lot: { code: 'BF-2609', expiresAt: daysFromNow(365) },
          },
          actor,
        );

        const recipe = await boms.create({
          outputVariantId: finished.variants[0].id,
          outputQuantity: '1000',
          licenceId: licence.id,
          lines: [
            { componentVariantId: blend.variants[0].id, quantity: '30' },
            {
              componentVariantId: bottle.variants[0].id,
              quantity: '1000',
              supplyType: 'external',
            },
          ],
        });

        await boms.promote(recipe.id);

        const run = await runs.create({
          outputVariantId: finished.variants[0].id,
          bomId: recipe.id,
          locationId: blending.id,
          quantityPlanned: '1000',
          reference: 'FOC-2609-01',
        });

        // Earliest expiry first picks BF-2609 — the only lot there (ADR-039).
        await runs.release(run.id, { sourceLocationId: shelf.id }, actor);

        await runs.recordOutput(
          run.id,
          {
            quantity: '980',
            lot: { code: 'FOC-2609-01', expiresAt: daysFromNow(730) },
          },
          actor,
        );

        const detail = await runs.findDetail(run.id);
        const blendLine = detail.lines.find(
          (line) => line.componentVariantId === blend.variants[0].id,
        );

        if (!blendLine) throw new Error('The run has no blend line to close');

        // Over plan on purpose: tops up 4 kg from the shelf and trips the
        // variance flag, so the notification path is exercised too.
        const closed = await runs.close(
          run.id,
          { lines: [{ lineId: blendLine.id, quantityConsumed: '34' }] },
          actor,
        );

        // Sold and shipped from the batch just made, so the demo covers the
        // sell side too — and the recall trail runs both ways: ingredient lot
        // BF-2609 into batch FOC-2609-01, and that batch out to a customer.
        const customer = await partners.create({
          name: 'Northside Pharmacy',
          code: 'NORTH',
        });

        const sale = await orders.create(
          {
            partnerId: customer.id,
            direction: 'sale',
            reference: 'SO-DEMO-1',
            lines: [
              {
                variantId: finished.variants[0].id,
                quantityOrdered: '600',
                unitPrice: '24.9900',
                currency: 'CAD',
              },
            ],
          },
          actor,
        );

        await orders.update(sale.id, { status: 'confirmed' });

        // Part of it, on purpose: 400 of 600 leaves the rest outstanding, so
        // the order page shows a partial shipment and the Ship button stays.
        const shipment = await shipments.ship(
          sale.id,
          {
            fromLocationId: blending.id,
            carrier: 'Canada Post',
            trackingNumber: 'DEMO123456789CA',
            lines: [{ lineId: sale.lines[0].id, quantity: '400' }],
          },
          actor,
        );

        /**
         * That shipment, invoiced and issued (ADR-046): 400 × 24.99 is
         * 9,996.00, and GST at 5% brings it to 10,495.80.
         *
         * What issuing needs comes first. The registered address and tax
         * number are set only if empty, because with an email this seeds an
         * existing organization, and its real details must survive. Tax
         * codes are reused by name for the same reason; the two-tax code and
         * Exempt are there so the Tax codes page has each shape to show.
         */
        const profile = await organization.get();

        if (!profile.taxRegistrationNumber) {
          await organization.update({
            taxRegistrationNumber: '123456789 RT0001',
          });
        }

        if (!profile.address) {
          await organization.setAddress({
            line1: '100 Demo Way',
            city: 'Vancouver',
            region: 'BC',
            postalCode: 'V6B 1A1',
            country: 'CA',
          });
        }

        await partnerAddresses.create(customer.id, {
          label: 'Accounts payable',
          line1: '12 Harbour Rd',
          city: 'Victoria',
          region: 'BC',
          postalCode: 'V8W 1A1',
          country: 'CA',
          isBilling: true,
          isDefault: true,
        });

        const existingCodes = await taxCodes.list();

        async function taxCode(
          name: string,
          components: { name: string; rate: string }[],
        ) {
          return (
            existingCodes.find((code) => code.name === name) ??
            (await taxCodes.create({ name, components }))
          );
        }

        const gst = await taxCode('GST', [{ name: 'GST', rate: '5' }]);
        await taxCode('GST + PST (BC)', [
          { name: 'GST', rate: '5' },
          { name: 'PST', rate: '7' },
        ]);
        await taxCode('Exempt', []);

        const draft = await invoices.createDraft(
          { shipmentId: shipment.id, taxCodeId: gst.id },
          actor,
        );

        await invoices.update(draft.id, { dueDate: daysFromNow(30) });

        // The UTC day, which is fine for demo data; the app itself sends
        // the person's own calendar day.
        const invoice = await invoices.issue(
          draft.id,
          { invoiceDate: daysFromNow(0) },
          actor,
        );

        const [batch] = await db
          .select({ id: lots.id })
          .from(lots)
          .where(
            and(
              eq(lots.organizationId, account.organizationId),
              eq(lots.code, 'FOC-2609-01'),
            ),
          );

        // Retained: still ours, never sendable (ADR-042).
        await stock.record(
          {
            variantId: finished.variants[0].id,
            lotId: batch.id,
            fromLocationId: blending.id,
            toLocationId: retention.id,
            quantity: '4',
            reason: 'transfer',
            note: 'Retention samples, lot FOC-2609-01',
          },
          actor,
        );

        // A hand-out to a prospect, recorded so a recall finds it (ADR-042).
        const prospect = await partners.create({
          name: 'Prospect Health Foods',
          code: 'PROSPECT',
        });

        await stock.record(
          {
            variantId: finished.variants[0].id,
            lotId: batch.id,
            fromLocationId: blending.id,
            quantity: '2',
            reason: 'sample',
            recipientPartnerId: prospect.id,
            note: 'Trade show',
          },
          actor,
        );

        // Some of the first shipment comes back, into the bin that checks it
        // before anything goes out again (ADR-043).
        await returns.receive(
          sale.id,
          {
            toLocationId: returnsBin.id,
            reason: 'damaged',
            note: 'Crushed in transit, carton of 5',
            lines: [
              {
                lineId: sale.lines[0].id,
                lots: [{ lotId: batch.id, quantity: '5' }],
              },
            ],
          },
          actor,
        );

        /**
         * A second customer wants more than is free. Confirmed anyway: it
         * holds what exists after the first order's claim, and the rest shows
         * as a backorder (ADR-045) — so Inventory's "Promised to customers"
         * and the order page both have something to show.
         */
        const secondCustomer = await partners.create({
          name: 'Harbour Health',
          code: 'HARBOUR',
        });

        const second = await orders.create(
          {
            partnerId: secondCustomer.id,
            direction: 'sale',
            reference: 'SO-DEMO-2',
            lines: [
              {
                variantId: finished.variants[0].id,
                quantityOrdered: '500',
                unitPrice: '24.9900',
                currency: 'CAD',
              },
            ],
          },
          actor,
        );

        await orders.update(second.id, { status: 'confirmed' });

        logger.log(
          `Demo data written for ${email}: run FOC-2609-01 closed with ${closed.variances.length} line variance(s); SO-DEMO-1 shipped 400 of 600, invoiced as ${invoice.number}, with 5 returned; 4 retained, 2 sampled; SO-DEMO-2 confirmed for 500 and partly backordered`,
        );
      },
    );
  } finally {
    await app.close();
  }
}

interface DemoAccount {
  userId: string;
  organizationId: string;
  email: string;
}

async function existingAccount(
  db: Database,
  email: string,
): Promise<DemoAccount | undefined> {
  const [row] = await db
    .select({ userId: users.id, organizationId: memberships.organizationId })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(eq(users.email, email));

  return row && { ...row, email };
}

/**
 * A new account and organization, registered exactly as the Register page
 * does it — user, organization and Owner membership in one transaction
 * (ADR-004) — so the demo is signed into like any real account. The email is
 * stamped with the time, so every run is its own organization.
 */
async function freshAccount(auth: AuthService): Promise<DemoAccount> {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace('T', '-')
    .slice(0, 15);

  const email = `demo-${stamp}@example.com`;

  const { user } = await auth.register({
    email,
    password: DEMO_PASSWORD,
    name: 'Demo Owner',
    organizationName: `Demo ${stamp}`,
  });

  if (!user.organizationId) {
    throw new Error('Registration created no organization');
  }

  new Logger('SeedDemo').log(
    `Registered ${email} — sign in with password ${DEMO_PASSWORD}`,
  );

  return { userId: user.id, organizationId: user.organizationId, email };
}

/**
 * A plain calendar day, sent the way a date input sends one. Relative to the
 * day the seed runs, so the page reads the same whenever it is seeded.
 */
function daysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

void seedDemo();
