import type { Permission, RoleTemplateKey } from '../permissions';

/**
 * Roles as the API returns them (ADR-068, ADR-080), described for the
 * OpenAPI document by the CLI plugin.
 */

/**
 * A role as a member holds it or an invitation names it, beside the
 * member or the invitation. A built-in role's name is worded by the
 * client, as on People and Members (ADR-054); a made role's is as its
 * organization named it, in any language, never translated.
 */
export class RoleRef {
  id!: string;
  name!: string;
  /** Owner, Admin or Viewer: the app's own, which nobody edits. */
  builtIn!: boolean;
}

/** One of the organization's roles, as Settings → Roles lists it. */
export class Role {
  id!: string;
  name!: string;
  /**
   * What it is for, in the reader's language: a built-in role's from the
   * catalogues, a made role's as written, or null when it has none.
   */
  description!: string | null;
  builtIn!: boolean;
  /** Everything it grants, in the catalogue's order. */
  permissions!: Permission[];
  /** How many members hold it. */
  holderCount!: number;
  /**
   * Whether the reader's roles together hold everything it grants, so
   * they may give it (ADR-080); Members and Invite disable the rest.
   */
  mayGive!: boolean;
}

/** A member holding a role, whose name opens their page on People. */
export class RoleHolder {
  id!: string;
  name!: string;
  /** As Members shows it, to every member (ADR-063). */
  email!: string;
  /** Their photo; null shows their initials. */
  photoFileId!: string | null;
  /** Every role they hold, this one among them, the built-in one first. */
  roles!: RoleRef[];
}

/** A role's page: the role, who holds it, and the version saved last. */
export class RoleDetail extends Role {
  /** By name. */
  holders!: RoleHolder[];
  /**
   * When it was saved last: sent back with a change, which is refused
   * with `role_changed` if someone else has saved it since (ADR-080).
   */
  updatedAt!: Date;
}

/** A permission as the editor offers it (ADR-080). */
export class CataloguePermission {
  key!: Permission;
  /** Its line, in the reader's language. */
  line!: string;
  /**
   * Who else hears of something through it, when a notification goes to
   * whoever holds it: "Also told when a line closes short."
   */
  note!: string | null;
  /**
   * What it needs held with it, ticked with it; only its own, since a
   * need's needs follow from it.
   */
  needs!: Permission[];
  /** False for what stays the Owners', which no made role may hold. */
  offered!: boolean;
  /** Every role holds it: shown ticked, and never unticked. */
  locked!: boolean;
}

/** Where making a role may start, named in the reader's language. */
export class RoleTemplate {
  key!: RoleTemplateKey;
  name!: string;
  permissions!: Permission[];
}

/** GET /roles/catalogue: every permission in order, and the templates. */
export class RoleCatalogue {
  permissions!: CataloguePermission[];
  templates!: RoleTemplate[];
}
