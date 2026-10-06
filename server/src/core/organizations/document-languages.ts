import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import type { Transaction } from '../../database/database.module';
import { organizations, partners } from '../../database/schema';
import { t } from '../../i18n/translate';

/** What a document prints in: one language, or two on a bilingual sheet. */
export interface DocumentLanguages {
  language: Locale;
  secondLanguage: Locale | null;
}

/**
 * The languages a document for this partner prints in (ADR-054): the
 * partner's pair when it has one, else the organization's. Never half of
 * each: a partner with no first language takes the organization's whole
 * pair.
 *
 * Read inside the caller's transaction at the moment the paper becomes a
 * document, a shipment at ship and an invoice at issue, and stored on it,
 * so a reprint reads as the original whatever either setting says by then.
 * A function over a transaction rather than a service method, as
 * registeredAddress is, because each caller needs it under its own lock.
 */
export async function documentLanguages(
  tx: Transaction,
  organizationId: string,
  partnerId: string,
): Promise<DocumentLanguages> {
  const [row] = await tx
    .select({
      organizationLanguage: organizations.documentLanguage,
      organizationSecond: organizations.documentSecondLanguage,
      partnerLanguage: partners.documentLanguage,
      partnerSecond: partners.documentSecondLanguage,
    })
    .from(organizations)
    .leftJoin(
      partners,
      and(
        eq(partners.organizationId, organizations.id),
        eq(partners.id, partnerId),
      ),
    )
    .where(eq(organizations.id, organizationId));

  if (!row)
    throw new NotFoundException(
      t({
        id: 'organizations.notFound',
        defaultMessage: 'No such organization',
      }),
    );

  if (row.partnerLanguage !== null) {
    return { language: row.partnerLanguage, secondLanguage: row.partnerSecond };
  }

  return {
    language: row.organizationLanguage,
    secondLanguage: row.organizationSecond,
  };
}

/**
 * Refuses a pair the database would refuse, with a sentence instead of a
 * 500 from its check constraints: no second language without a first, and
 * never the same one twice.
 *
 * Given the pair as it will stand after the change, so a request naming
 * one side is checked against the stored other.
 */
export function assertLanguagePair(
  language: Locale | null,
  secondLanguage: Locale | null,
): void {
  if (secondLanguage === null) return;

  if (language === null) {
    throw new BadRequestException(
      t({
        id: 'organizations.secondNeedsFirst',
        defaultMessage: 'A second document language needs a first one',
      }),
    );
  }

  if (secondLanguage === language) {
    throw new BadRequestException(
      t({
        id: 'organizations.languagesDiffer',
        defaultMessage:
          'The second document language must differ from the first',
      }),
    );
  }
}
