import type { HomeKind } from '../home.service';

/**
 * Home as the API returns it (ADR-068, ADR-058), described for the
 * OpenAPI document by the CLI plugin.
 */

/** One record a card lists. */
export class HomeRow {
  id!: string;
  title!: string;
  detail!: string | null;
  /** A calendar day, YYYY-MM-DD (ADR-052). */
  due!: string | null;
  late!: boolean;
}

/** One of Home's cards, in the order of a working day. */
export class HomeCard {
  kind!: HomeKind;
  count!: number;
  late!: number;
  rows!: HomeRow[];
}

/** Which getting-started steps the organization has done. */
export class GettingStartedSteps {
  organization!: boolean;
  location!: boolean;
  product!: boolean;
  partner!: boolean;
  receipt!: boolean;
  invoice!: boolean;
  team!: boolean;
}

export class GettingStarted {
  steps!: GettingStartedSteps;
  teamSkipped!: boolean;
  dismissed!: boolean;
  complete!: boolean;
}

/** GET /home. */
export class HomeResponse {
  gettingStarted!: GettingStarted;
  cards!: HomeCard[];
}
