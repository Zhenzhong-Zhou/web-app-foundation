/**
 * The health checks as the API returns them (ADR-068), for the host's
 * monitors rather than the app.
 */

/** GET /health: the process is up. */
export class Health {
  status!: string;
  /** Seconds since the process started. */
  uptime!: number;
  timestamp!: string;
  /** The deployed commit, when the host says. */
  commit!: string | null;
  /** The release, as server/package.json names it. */
  version!: string;
  /** The API revision within /v1 this build serves (ADR-081). */
  apiRevision!: number;
}

/** GET /health/ready: the database answers too. */
export class Readiness {
  status!: string;
  database!: string;
}
