/**
 * One entry of an account's own history (ADR-022) as the API returns it
 * (ADR-068), described for the OpenAPI document by the CLI plugin.
 */
export class AccountEvent {
  id!: string;
  /** What happened: `session.created`, `account.password_changed`. */
  action!: string;
  ip!: string | null;
  userAgent!: string | null;
  createdAt!: Date;
}
