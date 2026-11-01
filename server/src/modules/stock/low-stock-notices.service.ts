import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import {
  DEFAULT_LOCALE,
  type Locale,
  SUPPORTED_LOCALES,
} from '../../common/locales';
import { todayIn } from '../../common/today';
import {
  type Permission,
  TOLD,
  TOLD_LOW_NEEDS,
} from '../../core/authorization/permissions';
import { NOTIFICATION_TYPES } from '../../core/notifications/notification-types';
import {
  type Emission,
  NotificationsService,
} from '../../core/notifications/notifications.service';
import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import {
  products,
  productVariants,
  type ReorderSource,
} from '../../database/schema';
import { t } from '../../i18n/translate';
import { itemName, namesIn } from './item-name';
import { positionsOf } from './reorder-position';

/**
 * The SKUs a notice about several items names before "and 3 more"; all
 * of them when one more would be all.
 */
const NAMED = 2;

/** An item claimed as fallen low, as the claim returns it. */
type Claimed = {
  variant_id: string;
  source: ReorderSource;
  sku: string;
};

/**
 * Low stock in the bell (ADR-085), over every organization: no request
 * and so no tenant, hence the global database, as the licence reminders
 * have it (ADR-064). Each item that fell low is claimed on its point
 * before anyone is told, so two instances or two runs never tell it
 * twice; a claim whose telling fails is not retried (ADR-036).
 */
@Injectable()
export class LowStockNoticesService {
  private readonly logger = new Logger(LowStockNoticesService.name);

  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Tells what fell low since the last check; returns how many items were
   * told about. Each organization's position is read on its own today
   * (ADR-072), since a lot expired by it is not usable.
   */
  async check(now: Date = new Date()): Promise<number> {
    const { rows: holding } = await this.db.execute<{
      id: string;
      time_zone: string;
    }>(sql`
      select o.id, o.time_zone
      from organizations o
      where exists (
        select 1 from reorder_points rp where rp.organization_id = o.id
      )
    `);

    let told = 0;
    for (const organization of holding) {
      const claimed = await this.claim(
        organization.id,
        todayIn(organization.time_zone, now),
      );
      if (claimed.length === 0) continue;

      await this.tell(organization.id, claimed);
      told += claimed.length;
    }

    if (told > 0) this.logger.log(`Low stock: ${told} items told`);
    return told;
  }

  /**
   * In one statement, from one reading of the positions: claims each item
   * low and not yet told, and clears the claim of each item no longer low,
   * so that its next fall is told again. A discontinued item is never low,
   * so its claim clears too. The claimed come back in the list's order,
   * the furthest below their point first.
   */
  private async claim(
    organizationId: string,
    today: string,
  ): Promise<Claimed[]> {
    const org = sql`${organizationId}::uuid`;

    const { rows } = await this.db.execute<Claimed>(sql`
      with p as materialized (${positionsOf(organizationId, today)}),
      cleared as (
        update reorder_points rp
        set low_notified_at = null
        from p
        where rp.id = p.id
          and rp.organization_id = ${org}
          and rp.low_notified_at is not null
          and p.status not in ('low', 'out')
      ),
      claimed as (
        update reorder_points rp
        set low_notified_at = now()
        from p
        join product_variants pv
          on pv.id = p.variant_id
          and pv.organization_id = ${org}
        where rp.id = p.id
          and rp.organization_id = ${org}
          and rp.low_notified_at is null
          and p.status in ('low', 'out')
        returning rp.variant_id, rp.source, pv.sku, p.share
      )
      select c.variant_id, c.source, c.sku
      from claimed c
      order by c.share, c.sku
    `);

    return rows;
  }

  /**
   * One notice per person, about the items they can act on: a bought item
   * to whoever may raise an order, a made one to whoever may plan a run,
   * each holding TOLD_LOW_NEEDS too, since the notice opens the list.
   */
  private async tell(
    organizationId: string,
    claimed: Claimed[],
  ): Promise<void> {
    const holders = async (told: readonly Permission[]) =>
      new Set(await this.notifications.recipientsWith(organizationId, told));
    const [seeing, buying, making] = await Promise.all([
      holders([TOLD_LOW_NEEDS]),
      holders(TOLD.lowBought),
      holders(TOLD.lowMade),
    ]);

    const people = [...seeing]
      .map((userId) => ({
        userId,
        items: claimed.filter((item) =>
          (item.source === 'made' ? making : buying).has(userId),
        ),
      }))
      .filter((person) => person.items.length > 0);
    if (people.length === 0) return;

    const named = await this.namedFor(organizationId, people);

    await this.notifications.emit(
      people.map(({ userId, items }) => ({
        userId,
        organizationId,
        type: NOTIFICATION_TYPES.STOCK_LOW,
        ...(items.length === 1
          ? aboutOne(items[0], named.get(userId)!)
          : aboutSeveral(items)),
        // The list, which the bell opens filtered to Low: no row of its own.
        resourceType: 'reorder_points',
      })),
    );
  }

  /**
   * The one item's name in each reader's language (ADR-056), by the
   * reader, for everyone told of a single item: several are named by
   * their SKUs alone.
   */
  private async namedFor(
    organizationId: string,
    people: { userId: string; items: Claimed[] }[],
  ): Promise<Map<string, string>> {
    const single = people.filter((person) => person.items.length === 1);
    const locales = await this.notifications.localesOf(
      single.map((person) => person.userId),
    );

    const named = new Map<string, string>();
    for (const locale of SUPPORTED_LOCALES) {
      const readers = single.filter(
        (person) => (locales.get(person.userId) ?? DEFAULT_LOCALE) === locale,
      );
      if (readers.length === 0) continue;

      const names = await this.namesOf(
        organizationId,
        readers.map(({ items }) => items[0].variant_id),
        locale,
      );
      // Found: the claim read each item through its variant.
      for (const { userId, items } of readers) {
        named.set(userId, names.get(items[0].variant_id)!);
      }
    }
    return named;
  }

  /** Items' names in a language, "Focus (60ct)", by the item's id. */
  private async namesOf(
    organizationId: string,
    variantIds: string[],
    locale: Locale,
  ): Promise<Map<string, string>> {
    const shown = namesIn(locale, organizationId);
    const rows = await this.db
      .select({
        id: productVariants.id,
        productName: shown.productName,
        variantName: shown.variantName,
      })
      .from(productVariants)
      .innerJoin(
        products,
        and(
          eq(products.id, productVariants.productId),
          eq(products.organizationId, organizationId),
        ),
      )
      .where(
        and(
          eq(productVariants.organizationId, organizationId),
          inArray(productVariants.id, variantIds),
        ),
      );

    return new Map(
      rows.map((row) => [row.id, itemName(row.productName, row.variantName)]),
    );
  }
}

/**
 * A person's notice when one item fell below (ADR-085): its SKU, and its
 * name with what to do, by how it is replenished. No quantity, which the
 * list shows as it stands.
 */
function aboutOne(
  item: Claimed,
  name: string,
): Pick<Emission, 'title' | 'body'> {
  return {
    title: t(
      {
        id: 'notifications.stockLow.one',
        defaultMessage: '{sku} fell below its reorder point',
      },
      { sku: item.sku },
    ),
    body: t(
      {
        id: 'notifications.stockLow.oneBody',
        defaultMessage:
          '{source, select, made {{name}. Plan a run from Reorder points.} other {{name}. Raise a purchase order from Reorder points.}}',
      },
      { source: item.source, name },
    ),
  };
}

/**
 * When several fell below: how many, and the first few SKUs, so points
 * set on a hundred items at once do not fill the bell (ADR-085). What to
 * do follows the items, as one item's notice does: order them when all
 * are bought, plan them when all are made, either when both. Someone who
 * only buys is told of bought items alone, so always reads "Order them".
 */
function aboutSeveral(items: Claimed[]): Pick<Emission, 'title' | 'body'> {
  const shown = items.length <= NAMED + 1 ? items : items.slice(0, NAMED);
  const more = items.length - shown.length;
  const sources = new Set(items.map((item) => item.source));
  const what = sources.size === 1 ? items[0].source : 'both';

  return {
    title: t(
      {
        id: 'notifications.stockLow.several',
        defaultMessage:
          '{count, plural, one {# item fell below its reorder point} other {# items fell below their reorder point}}',
      },
      { count: items.length },
    ),
    body: t(
      {
        id: 'notifications.stockLow.severalBody',
        defaultMessage:
          '{what, select, bought {{items}. Order them from Reorder points.} made {{items}. Plan them from Reorder points.} other {{items}. Order or plan them from Reorder points.}}',
      },
      {
        what,
        items: [
          ...shown.map((item) => item.sku),
          ...(more > 0
            ? [
                t(
                  {
                    id: 'notifications.stockLow.more',
                    defaultMessage: '{count} more',
                  },
                  { count: more },
                ),
              ]
            : []),
        ],
      },
    ),
  };
}
