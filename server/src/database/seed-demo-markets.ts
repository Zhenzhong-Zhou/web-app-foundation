import type { INestApplicationContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { BomsService } from '../modules/boms/boms.service';
import { ProductLicencesService } from '../modules/product-licences/product-licences.service';
import { ProductsService } from '../modules/products/products.service';
import type { Database } from './database.module';
import { productVariants } from './schema';
import { daysFromNow } from './seed-demo-variety';
import { runInTenantContext } from './tenant-context';

/**
 * One product for two markets, as the Items guide tells it (ADR-092's
 * review): one item, a variant for each market with its own code, recipe,
 * licence and names, never a second item.
 *
 * - **Focus,** FOCUS-60-CA under a Health Canada licence and FOCUS-60-CN
 *   under a China registration (SAMR), each its own recipe, the Chinese
 *   variant named 专注胶囊 60 粒.
 * - **Vitamin D3,** VITD-30-CA and VITD-30-EXP: two recipes under one
 *   licence, the same bottle, a different label in each.
 *
 * Added last, on items and stock of their own, so no figure the manual
 * checks name moves. Read back as a recipe's page shows it, so a change
 * upstream that loses a recipe, its licence or its label fails the seed,
 * and CI with it.
 */
export async function addMarkets(
  app: INestApplicationContext,
  db: Database,
  owner: { userId: string; organizationId: string },
): Promise<string> {
  const products = app.get(ProductsService);
  const licences = app.get(ProductLicencesService);
  const boms = app.get(BomsService);
  const { organizationId } = owner;

  async function variantOf(code: string): Promise<string> {
    const [row] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          eq(productVariants.sku, code),
        ),
      );
    if (!row) throw new Error(`The demo has no item ${code}`);
    return row.id;
  }

  return runInTenantContext(owner, async () => {
    /** An item and its first variant; more are added after. */
    async function item(
      type: 'good' | 'material' | 'packaging',
      name: string,
      variant: { sku: string; name?: string; unitOfMeasure?: string },
    ) {
      const created = await products.create({
        type,
        name,
        variant: {
          unitOfMeasure: 'each',
          tracksLots: type !== 'packaging',
          ...variant,
        },
      });
      return { productId: created.id, variantId: created.variants[0].id };
    }

    /** A recipe for 1,000 of a variant, under its licence, promoted. */
    async function recipe(
      outputVariantId: string,
      licenceId: string,
      lines: { componentVariantId: string; quantity: string }[],
    ) {
      const draft = await boms.create({
        outputVariantId,
        outputQuantity: '1000',
        licenceId,
        lines,
      });
      await boms.promote(draft.id);
      return draft.id;
    }

    // Focus, for Canada and for China: the same blend and bottle, each
    // market its own recipe under its own authority's registration.
    const blend = await variantOf('BLEND-FOCUS');
    const bottle60 = await variantOf('BOTTLE-60');
    const focus = await item('good', 'Focus', {
      sku: 'FOCUS-60-CA',
      name: 'Canada, 60 capsules',
    });
    const focusChina = await products.addVariant(focus.productId, {
      sku: 'FOCUS-60-CN',
      name: 'China, 60 capsules',
      unitOfMeasure: 'each',
      tracksLots: true,
    });
    await products.setVariantTranslations(focus.productId, focusChina.id, {
      translations: [{ locale: 'zh-Hans', name: '专注胶囊 60 粒' }],
    });
    const npnFocus = await licences.create({
      number: '80045678',
      authority: 'Health Canada',
      issuedAt: daysFromNow(-120),
      notes: 'Demo data — not a real registration',
    });
    const samrFocus = await licences.create({
      number: '国食健注G20260123',
      authority: 'SAMR',
      issuedAt: daysFromNow(-90),
      expiresAt: daysFromNow(5 * 365),
      notes: 'Demo data — not a real registration',
    });
    const focusLines = [
      { componentVariantId: blend, quantity: '30' },
      { componentVariantId: bottle60, quantity: '1000' },
    ];
    await recipe(focus.variantId, npnFocus.id, focusLines);
    await recipe(focusChina.id, samrFocus.id, focusLines);

    // Vitamin D3, sold at home and abroad under one licence: the same
    // softgels and bottle, the label each market reads.
    const softgels = await item('material', 'Vitamin D3 1000 IU softgels', {
      sku: 'VITD-SOFTGEL',
    });
    const bottle30 = await item('packaging', '30ct bottle', {
      sku: 'BOTTLE-30',
    });
    const labelCanada = await item('packaging', 'Vitamin D3 label, Canada', {
      sku: 'LABEL-VITD-CA',
    });
    const labelExport = await item('packaging', 'Vitamin D3 label, export', {
      sku: 'LABEL-VITD-EXP',
    });
    const vitaminD = await item('good', 'Vitamin D3 1000 IU, 30 softgels', {
      sku: 'VITD-30-CA',
      name: 'Canada',
    });
    const vitaminDExport = await products.addVariant(vitaminD.productId, {
      sku: 'VITD-30-EXP',
      name: 'Export',
      unitOfMeasure: 'each',
      tracksLots: true,
    });
    const npnVitaminD = await licences.create({
      number: '80076543',
      authority: 'Health Canada',
      issuedAt: daysFromNow(-60),
      notes: 'Demo data — not a real registration',
    });
    const withLabel = (label: string) => [
      { componentVariantId: softgels.variantId, quantity: '30000' },
      { componentVariantId: bottle30.variantId, quantity: '1000' },
      { componentVariantId: label, quantity: '1000' },
    ];
    await recipe(
      vitaminD.variantId,
      npnVitaminD.id,
      withLabel(labelCanada.variantId),
    );
    await recipe(
      vitaminDExport.id,
      npnVitaminD.id,
      withLabel(labelExport.variantId),
    );

    // Read back: each market's variant has one recipe in use, under the
    // licence it was given; Vitamin D3's two share theirs and the bottle,
    // each with its own label; and the Chinese variant has its name.
    const active = async (variantId: string) => {
      const found = await boms.list({
        outputVariantId: variantId,
        status: 'active',
      });
      if (found.length !== 1) {
        throw new Error(
          `The demo's variant ${variantId} should have one recipe in use, and has ${found.length}`,
        );
      }
      return boms.findDetail(found[0].id);
    };
    const [focusCa, focusCn, vitaminDCa, vitaminDExp] = await Promise.all([
      active(focus.variantId),
      active(focusChina.id),
      active(vitaminD.variantId),
      active(vitaminDExport.id),
    ]);
    if (
      focusCa.licenceId !== npnFocus.id ||
      focusCn.licenceId !== samrFocus.id
    ) {
      throw new Error(
        'Focus for Canada and for China should each be made under its own licence',
      );
    }
    const components = (detail: typeof vitaminDCa) =>
      detail.lines.map((line) => line.componentVariantId);
    if (
      vitaminDCa.licenceId !== npnVitaminD.id ||
      vitaminDExp.licenceId !== npnVitaminD.id ||
      !components(vitaminDCa).includes(bottle30.variantId) ||
      !components(vitaminDExp).includes(bottle30.variantId) ||
      !components(vitaminDCa).includes(labelCanada.variantId) ||
      !components(vitaminDExp).includes(labelExport.variantId) ||
      components(vitaminDCa).includes(labelExport.variantId)
    ) {
      throw new Error(
        'Vitamin D3 at home and for export should share a licence and a bottle, each with its own label',
      );
    }
    const detail = await products.findById(focus.productId, 'zh-Hans');
    const china = detail.variants.find((each) => each.sku === 'FOCUS-60-CN');
    if (
      !china?.translations?.some(
        (each) => each.locale === 'zh-Hans' && each.name === '专注胶囊 60 粒',
      )
    ) {
      throw new Error('FOCUS-60-CN should be named 专注胶囊 60 粒 in Chinese');
    }

    return 'One product for two markets: Focus, FOCUS-60-CA (Health Canada) and FOCUS-60-CN (SAMR, 专注胶囊 60 粒), each its own recipe; Vitamin D3, VITD-30-CA and VITD-30-EXP, two recipes under one licence, BOTTLE-30 in both, LABEL-VITD-CA and LABEL-VITD-EXP';
  });
}
