/**
 * Deleting an organization, as the API returns it (ADR-068, ADR-070),
 * described for the OpenAPI document by the CLI plugin.
 */

/** POST /organization/deletion: when the organization will be deleted. */
export class OrganizationDeletionScheduled {
  /**
   * The deletion day, YYYY-MM-DD (ADR-052): cancellable until it has ended
   * in every time zone, and completed after.
   */
  deletionScheduledAt!: string;
}
