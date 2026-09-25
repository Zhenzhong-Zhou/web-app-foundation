import { sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { documentSequences, type DocumentType } from '../../database/schema';

/**
 * What a printed number starts with. In code for now; a per-organization
 * prefix is a column on document_sequences when someone asks for one.
 */
const PREFIXES: Record<DocumentType, string> = {
  invoice: 'INV-',
  credit_note: 'CN-',
};

/**
 * The next number in an organization's series, taken inside the caller's
 * transaction (ADR-046).
 *
 * One upsert: the first document creates the row at 2 and takes 1; every
 * later one increments and takes the value before. The row lock the upsert
 * holds lasts until the caller commits, so two issues queue rather than
 * share a number, and a rolled-back issue gives its number back.
 */
export async function takeNumber(
  tx: Transaction,
  organizationId: string,
  documentType: DocumentType,
): Promise<string> {
  const [row] = await tx
    .insert(documentSequences)
    .values({ organizationId, documentType, nextValue: 2 })
    .onConflictDoUpdate({
      target: [
        documentSequences.organizationId,
        documentSequences.documentType,
      ],
      set: { nextValue: sql`${documentSequences.nextValue} + 1` },
    })
    .returning({ nextValue: documentSequences.nextValue });

  const taken = row.nextValue - 1;
  return `${PREFIXES[documentType]}${String(taken).padStart(6, '0')}`;
}
