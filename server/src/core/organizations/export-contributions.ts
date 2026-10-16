import { Injectable } from '@nestjs/common';

import type { Transaction } from '../../database/database.module';

/** One more file in an organization's export (ADR-071). */
export interface ExportEntry {
  /** Its path in the archive. */
  name: string;
  /** Its bytes, made only when the archive reaches it. */
  bytes: () => Promise<Buffer>;
}

/**
 * What a module adds to the organization's export beyond its tables. The
 * invoices module adds every invoice and credit note as a PDF: core may
 * not import a module, so the module brings them here instead.
 */
export interface ExportContributor {
  /**
   * The entries, listed in the export's own transaction, so they are the
   * records its CSVs hold; each is made after the tables, one at a time.
   */
  entries(tx: Transaction, organizationId: string): Promise<ExportEntry[]>;
}

/** Where modules register what they add to the export. */
@Injectable()
export class ExportContributions {
  private readonly contributors: ExportContributor[] = [];

  register(contributor: ExportContributor): void {
    this.contributors.push(contributor);
  }

  all(): readonly ExportContributor[] {
    return this.contributors;
  }
}
