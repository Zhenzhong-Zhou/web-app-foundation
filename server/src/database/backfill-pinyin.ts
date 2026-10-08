import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { eq, isNull } from 'drizzle-orm';

import { AppModule } from '../app.module';
import { namePinyin } from '../common/pinyin';
import { type Database, UNSAFE_GLOBAL_DB } from './database.module';
import {
  partners,
  products,
  productTranslations,
  productVariants,
  variantTranslations,
} from './schema';

/**
 * Fills name_pinyin on rows written before migration 0042 (ADR-056).
 *
 * Postgres cannot turn Chinese into pinyin, so the migration adds the
 * columns empty and this writes them, once per database, with the same
 * helper the services call on every save. Rows with no Chinese stay null,
 * so running it again finds them again and changes nothing; safe to repeat.
 *
 * Across every organization on purpose, which is why it reads through
 * UNSAFE_GLOBAL_DB: it writes nothing but a column derived from the row's
 * own name.
 *
 *   npm run backfill:pinyin            the database in .env
 *   MIGRATE_TARGET=test npm run …      not needed: tests start empty
 */
const TABLES = [
  ['products', products],
  ['product_variants', productVariants],
  ['product_translations', productTranslations],
  ['variant_translations', variantTranslations],
  ['partners', partners],
] as const;

async function backfill(): Promise<void> {
  const logger = new Logger('BackfillPinyin');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const db = app.get<Database>(UNSAFE_GLOBAL_DB);

    for (const [label, table] of TABLES) {
      const rows = await db
        .select({ id: table.id, name: table.name })
        .from(table)
        .where(isNull(table.namePinyin));

      let written = 0;
      for (const row of rows) {
        const pinyin = namePinyin(row.name);
        if (pinyin === null) continue;
        await db
          .update(table)
          .set({ namePinyin: pinyin })
          .where(eq(table.id, row.id));
        written += 1;
      }

      logger.log(`${label}: ${written} of ${rows.length} rows given pinyin`);
    }
  } finally {
    await app.close();
  }
}

void backfill();
