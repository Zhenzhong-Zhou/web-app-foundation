import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { boms, productionOrders } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { ProductionOrder } from './production-orders.service';

type Tx = Parameters<Parameters<TenantDb['transaction']>[0]>[0];
type Bom = typeof boms.$inferSelect;

/**
 * The checks every action on a production order starts from: that the run is
 * this organization's, that its status allows the action, and — for anything
 * that issues — the recipe behind it. Shared by the services that plan,
 * release and close a run, so none of them can check differently.
 */

/** Refuses an action the run's status does not allow, naming both. */
export function assertStatus(
  actual: string,
  required: string,
  verb: string,
): void {
  if (actual !== required) {
    throw new ConflictException(
      t(
        {
          id: 'production.actualRunVerbRequired',
          defaultMessage:
            'A {actual} run cannot be {verb} — it must be {required}',
        },
        { actual, verb, required },
      ),
    );
  }
}

/**
 * A run of this organization, or a 404 — the organization is in the where
 * clause, so another tenant's run reads as one that does not exist.
 */
export async function loadWithin(
  tx: Tx,
  organizationId: string,
  runId: string,
) {
  const [run] = await tx
    .select()
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.organizationId, organizationId),
        eq(productionOrders.id, runId),
      ),
    );

  if (!run)
    throw new NotFoundException(
      t({
        id: 'production.suchProductionOrder',
        defaultMessage: 'No such production order',
      }),
    );

  return run;
}

/**
 * The run and the recipe behind it, for the two paths that answer "what
 * would this issue": the preview and the release itself.
 *
 * Shared so they cannot drift. A preview built from a different recipe, or
 * one that allowed a status release refuses, would show somebody a plan
 * they cannot act on. What differs comes after: release copies the lines
 * and takes locks, the preview does neither.
 */
export async function loadForIssue(
  tx: Tx,
  organizationId: string,
  runId: string,
): Promise<{ run: ProductionOrder; bom: Bom }> {
  const run = await loadWithin(tx, organizationId, runId);

  assertStatus(run.status, 'draft', 'released');

  if (!run.bomId) {
    throw new ConflictException(
      t({
        id: 'production.runBomSoThere',
        defaultMessage:
          'This run has no BOM, so there is nothing to issue — attach one first',
      }),
    );
  }

  const [bom] = await tx
    .select()
    .from(boms)
    .where(
      and(eq(boms.organizationId, organizationId), eq(boms.id, run.bomId)),
    );

  if (!bom)
    throw new NotFoundException(
      t({ id: 'production.suchBom', defaultMessage: 'No such BOM' }),
    );

  return { run, bom };
}
