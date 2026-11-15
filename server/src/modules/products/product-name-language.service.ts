import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { ERROR_CODES, withCode } from '../../common/error-codes';
import type { Locale } from '../../common/locales';
import { namePinyin } from '../../common/pinyin';
import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import type { RequestContext } from '../../core/auth/request-context';
import type { Transaction } from '../../database/database.module';
import {
  auditLog,
  organizations,
  products,
  productTranslations,
  productVariants,
  variantTranslations,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { languageName, t } from '../../i18n/translate';
import { MAX_CHANGED_AT_ONCE } from './dto/change-products.dto';
import type {
  ChooseProductNameLanguageDto,
  ProductNameChoiceDto,
} from './dto/product-name-language.dto';
import type {
  ProductNameLanguageChosen,
  ProductNameLanguagePreview,
} from './dto/product-name-language-response.dto';
import {
  namesToChoose,
  type NameToChoose,
  productNameLanguageOf,
} from './product-name-language';

/** A row's key, for matching a choice to its row. */
const keyOf = (row: { kind: string; id: string }) => `${row.kind}:${row.id}`;

/**
 * The language the organization's items are named in (ADR-054, amended for
 * #531): what choosing it will do, then the choice, in which the own names
 * count as that language's, the copies kept in it go, and each name that
 * differs is kept as chosen.
 */
@Injectable()
export class ProductNameLanguageService {
  private readonly logger = new Logger(ProductNameLanguageService.name);

  constructor(private readonly tenantDb: TenantDb) {}

  preview(language: Locale): Promise<ProductNameLanguagePreview> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const names = await namesToChoose(tx, organizationId, language);
      return {
        language,
        items: names.items,
        variants: names.variants,
        copies: names.copies,
        total: names.total,
        differing: names.differing.map((row) => ({
          kind: row.kind,
          id: row.id,
          productId: row.productId,
          sku: row.sku,
          ownName: row.ownName,
          keptName: row.keptName,
          ownDescription: row.ownDescription,
          keptDescription: row.keptDescription,
        })),
      };
    });
  }

  /**
   * In one transaction, the organization's row locked first, so a names
   * save waits for it: the list worked out again and checked against the
   * rows chosen, then each choice applied, every name kept in the language
   * removed, and the language set. Each item renamed is recorded in its
   * History, as Edit's Save would record it.
   */
  choose(
    input: ChooseProductNameLanguageDto,
    actor: RequestContext,
  ): Promise<ProductNameLanguageChosen> {
    const { language } = input;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const before = await productNameLanguageOf(
        tx,
        organizationId,
        'no key update',
      );
      const names = await namesToChoose(tx, organizationId, language);

      if (names.total > MAX_CHANGED_AT_ONCE) {
        throw new ConflictException(
          t(
            {
              id: 'products.namesToChooseTooMany',
              defaultMessage:
                '{count, number} names kept in {language} differ from their own, and at most {limit, number} can be chosen at once. Change some in Edit names first, then choose again.',
            },
            {
              count: names.total,
              language: languageName(language),
              limit: MAX_CHANGED_AT_ONCE,
            },
          ),
        );
      }
      if (!sameRows(names.differing, input.choices)) {
        throw new ConflictException(
          withCode(
            t({
              id: 'products.namesChanged',
              defaultMessage:
                'The names changed since this list was shown, so nothing was saved. Look over the list again, then save.',
            }),
            ERROR_CODES.productNamesChanged,
          ),
        );
      }
      const left = input.choices.filter((choice) => !choice.keep).length;
      if (left > 0) {
        throw new ConflictException(
          t(
            {
              id: 'products.namesNotChosen',
              defaultMessage:
                '{count, plural, one {# name has} other {# names have}} no choice yet. Choose the own name or the {language} name on each row, then save.',
            },
            { count: left, language: languageName(language) },
          ),
        );
      }

      const chosen = new Map(
        input.choices.map((choice) => [keyOf(choice), choice.keep]),
      );
      const renamed = names.differing.filter(
        (row) => chosen.get(keyOf(row)) === 'kept',
      );
      await rename(tx, organizationId, renamed);

      // Every name kept in it goes: the copies, the own name chosen, and
      // the kept name chosen, which is now the own.
      await tx
        .delete(productTranslations)
        .where(
          and(
            eq(productTranslations.organizationId, organizationId),
            eq(productTranslations.locale, language),
          ),
        );
      await tx
        .delete(variantTranslations)
        .where(
          and(
            eq(variantTranslations.organizationId, organizationId),
            eq(variantTranslations.locale, language),
          ),
        );
      await tx
        .update(organizations)
        .set({ productNameLanguage: language })
        .where(eq(organizations.id, organizationId));

      if (renamed.length > 0) {
        await tx
          .insert(auditLog)
          .values(historyOf(renamed, language, organizationId, actor));
      }

      const result = {
        copiesRemoved: names.copies,
        namesRemoved: names.differing.length - renamed.length,
        renamed: renamed.length,
      };
      recordContext({
        productNameLanguage: { from: before, to: language },
        ...result,
      });
      this.logger.log(`Items named in ${language} for ${organizationId}`);
      return result;
    });
  }
}

/**
 * The choices name exactly the rows worked out now, each as it was shown:
 * a row added, gone or changed since means the list is not the one chosen
 * from.
 */
function sameRows(rows: NameToChoose[], choices: ProductNameChoiceDto[]) {
  const shown = new Map(choices.map((choice) => [keyOf(choice), choice]));
  return (
    rows.length === choices.length &&
    rows.every((row) => {
      const choice = shown.get(keyOf(row));
      return (
        choice !== undefined &&
        (choice.ownName ?? null) === row.ownName &&
        choice.keptName === row.keptName &&
        (choice.ownDescription ?? null) === row.ownDescription &&
        (choice.keptDescription ?? null) === row.keptDescription
      );
    })
  );
}

/**
 * The kept name becomes the own, as Edit renames, its pinyin with it; an
 * item's kept description too, where it has one.
 */
async function rename(
  tx: Transaction,
  organizationId: string,
  rows: NameToChoose[],
) {
  const items = rows.filter((row) => row.kind === 'item');
  const variants = rows.filter((row) => row.kind === 'variant');

  if (items.length > 0) {
    await tx.execute(sql`
      update ${products} set
        name = v.name,
        name_pinyin = v.name_pinyin,
        description = coalesce(v.description, ${products.description})
      from (values ${sql.join(
        items.map(
          (row) =>
            sql`(${row.id}::uuid, ${row.keptName}::text,
              ${namePinyin(row.keptName)}::text, ${row.keptDescription}::text)`,
        ),
        sql`, `,
      )}) as v(id, name, name_pinyin, description)
      where ${products.organizationId} = ${organizationId}::uuid
        and ${products.id} = v.id
    `);
  }
  if (variants.length > 0) {
    await tx.execute(sql`
      update ${productVariants} set
        name = v.name,
        name_pinyin = v.name_pinyin
      from (values ${sql.join(
        variants.map(
          (row) =>
            sql`(${row.id}::uuid, ${row.keptName}::text,
              ${namePinyin(row.keptName)}::text)`,
        ),
        sql`, `,
      )}) as v(id, name, name_pinyin)
      where ${productVariants.organizationId} = ${organizationId}::uuid
        and ${productVariants.id} = v.id
    `);
  }
}

/**
 * An entry in each renamed item's History, as its own Save would write
 * it, saying the language it was renamed for: the item's name from and to,
 * or the variant's, by its code.
 */
function historyOf(
  rows: NameToChoose[],
  language: Locale,
  organizationId: string,
  actor: RequestContext,
) {
  // An item renamed here is labelled with its new name, its variants too.
  const itemNames = new Map(
    rows
      .filter((row) => row.kind === 'item')
      .map((row) => [row.productId, row.keptName]),
  );
  return rows.map((row) => {
    const name =
      row.ownName === row.keptName
        ? {}
        : { name: { from: row.ownName, to: row.keptName } };
    return {
      organizationId,
      actorId: actor.userId,
      action:
        row.kind === 'item'
          ? AUDIT_ACTIONS.PRODUCT_UPDATED
          : AUDIT_ACTIONS.PRODUCT_VARIANT_UPDATED,
      resourceType: 'product',
      resourceId: row.productId,
      resourceLabel: itemNames.get(row.productId) ?? row.itemName,
      payload: {
        ...(row.kind === 'variant' ? { sku: row.sku } : {}),
        ...name,
        productNameLanguage: language,
      },
      ip: actor.ip,
      userAgent: actor.userAgent,
    };
  });
}
