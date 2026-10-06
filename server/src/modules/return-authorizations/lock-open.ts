import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { returnAuthorizations } from '../../database/schema';
import { t } from '../../i18n/translate';

/**
 * The RMA, locked, and only if it is still open. Cancelling, closing,
 * raising a replacement and linking a return all start here.
 */
export async function lockOpen(
  tx: Transaction,
  organizationId: string,
  returnAuthorizationId: string,
) {
  const [rma] = await tx
    .select()
    .from(returnAuthorizations)
    .where(
      and(
        eq(returnAuthorizations.organizationId, organizationId),
        eq(returnAuthorizations.id, returnAuthorizationId),
      ),
    )
    .for('update');

  if (!rma)
    throw new NotFoundException(
      t({
        id: 'rmas.suchReturnAuthorization',
        defaultMessage: 'No such return authorization',
      }),
    );

  if (rma.status !== 'open') {
    throw new ConflictException(
      t(
        {
          id: 'rmas.numberStatus',
          defaultMessage: '{number} is already {status}',
        },
        { number: rma.number, status: rma.status },
      ),
    );
  }

  return rma;
}
