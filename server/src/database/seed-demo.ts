import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq } from 'drizzle-orm';

import { AppModule } from '../app.module';
import { BomsService } from '../modules/boms/boms.service';
import { LocationsService } from '../modules/locations/locations.service';
import { OrdersService } from '../modules/orders/orders.service';
import { PartnersService } from '../modules/partners/partners.service';
import { ProductLicencesService } from '../modules/product-licences/product-licences.service';
import { ProductionOrdersService } from '../modules/production-orders/production-orders.service';
import { ProductsService } from '../modules/products/products.service';
import { type Database, UNSAFE_GLOBAL_DB } from './database.module';
import { memberships, users } from './schema';
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
 *     npm run seed:demo -- owner@alpha.example.com
 *
 * The account must already exist: everything here is tenant-scoped, so a demo
 * organization nobody can sign in to would be unreachable from the UI.
 */
async function seedDemo(): Promise<void> {
  const logger = new Logger('SeedDemo');

  if (process.env.NODE_ENV === 'production') {
    logger.error('Refusing to write demo data to a production database');
    process.exitCode = 1;
    return;
  }

  const email = process.argv[2]?.trim().toLowerCase();

  if (!email) {
    logger.error('Usage: npm run seed:demo -- <owner email>');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const db = app.get<Database>(UNSAFE_GLOBAL_DB);

    const [account] = await db
      .select({ userId: users.id, organizationId: memberships.organizationId })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(users.email, email));

    if (!account) {
      logger.error(`No account for ${email} — register it first`);
      process.exitCode = 1;
      return;
    }

    const products = app.get(ProductsService);
    const locations = app.get(LocationsService);
    const licences = app.get(ProductLicencesService);
    const partners = app.get(PartnersService);
    const orders = app.get(OrdersService);
    const boms = app.get(BomsService);
    const runs = app.get(ProductionOrdersService);

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

        logger.log(
          `Demo data written for ${email}: run FOC-2609-01 closed with ${closed.variances.length} line variance(s)`,
        );
      },
    );
  } finally {
    await app.close();
  }
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
