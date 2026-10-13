/**
 * The person's own work details in the organization they are working in
 * (ADR-068), described for the OpenAPI document by the CLI plugin.
 */
export class WorkDetails {
  jobTitle!: string | null;
  department!: string | null;
  location!: string | null;
  workPhone!: string | null;
  extension!: string | null;
}
