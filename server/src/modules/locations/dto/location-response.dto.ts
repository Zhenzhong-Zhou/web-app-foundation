/** A site's address (ADR-071): where goods are delivered and sent back. */
export class SiteAddress {
  line1!: string;
  line2!: string | null;
  city!: string | null;
  region!: string | null;
  postalCode!: string | null;
  /** Two letters: CA, US. */
  country!: string;
}

/**
 * Locations as the API returns them (ADR-068), described for the OpenAPI
 * document by the CLI plugin: the tree's fields the client reads, and not
 * the organization a location belongs to.
 */
export class Location {
  id!: string;
  /** What kind of place: a site, a room, a shelf (ADR-024). */
  type!: string;
  name!: string;
  code!: string | null;
  /** Null at the top of the tree. */
  parentId!: string | null;
  /** Whether its stock can be promised (ADR-042). */
  isAvailable!: boolean;
  isActive!: boolean;
  /** A site's address, or null: only a site has one (ADR-071). */
  address!: SiteAddress | null;
}

/** POST /locations: the location as created. */
export class CreatedLocation {
  location!: Location;
}

/**
 * The site a document names (ADR-071, amended): a purchase order's Deliver
 * to, an RMA's Send back to. Its name for the page; its address is read
 * from the site when a document prints it, so a change reaches the next
 * printing.
 */
export class ChosenSite {
  id!: string;
  name!: string;
}
