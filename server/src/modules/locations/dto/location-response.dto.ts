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
}

/** POST /locations: the location as created. */
export class CreatedLocation {
  location!: Location;
}
