import type { RecentKind } from '../../../database/schema';

/**
 * The person's recently opened records as the API returns them (ADR-068),
 * described for the OpenAPI document by the CLI plugin.
 */

export class RecentEntry {
  kind!: RecentKind;
  id!: string;
  /** Null where the record has no name yet: a draft invoice. */
  title!: string | null;
  detail!: string | null;
  openedAt!: Date;
}

/** GET /recent. */
export class RecentList {
  recent!: RecentEntry[];
}
