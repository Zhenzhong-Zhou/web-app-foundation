import { ConflictException, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import {
  organizations,
  productLicences,
  type ReleaseLicenceStatus,
} from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';
import {
  type LicenceOutcome,
  licenceStatus,
  type LicenceStatusAtRelease,
  recordedStatus,
  releaseOutcome,
} from '../product-licences/licence-status';

/**
 * What release would do with a run's licence (ADR-050): the licence, its
 * state today, and the organization's answer for that state.
 *
 * One function for the issue plan and for release, so the dialog cannot
 * show one outcome while release acts on another — the reason loadForIssue
 * is shared too. Release asks for the lock; the preview does not, and
 * release computes it again rather than trusting what the dialog saw.
 */
export interface LicenceCheck {
  licence: {
    id: string;
    number: string;
    authority: string;
    /** Calendar days, YYYY-MM-DD (ADR-052). */
    issuedAt: string | null;
    expiresAt: string | null;
  } | null;
  status: LicenceStatusAtRelease;
  outcome: LicenceOutcome;
}

export async function checkLicence(
  tx: Transaction,
  organizationId: string,
  licenceId: string | null,
  options: { lock: boolean },
): Promise<LicenceCheck> {
  const [policy] = await tx
    .select({
      licenceNotInForcePolicy: organizations.licenceNotInForcePolicy,
      licenceExpiredPolicy: organizations.licenceExpiredPolicy,
      licenceRequired: organizations.licenceRequired,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId));

  if (!policy)
    throw new NotFoundException(
      t({
        id: 'production.suchOrganization',
        defaultMessage: 'No such organization',
      }),
    );

  if (!licenceId) {
    return {
      licence: null,
      status: 'none',
      outcome: releaseOutcome('none', policy),
    };
  }

  const query = tx
    .select({
      id: productLicences.id,
      number: productLicences.number,
      authority: productLicences.authority,
      issuedAt: productLicences.issuedAt,
      expiresAt: productLicences.expiresAt,
      isActive: productLicences.isActive,
    })
    .from(productLicences)
    .where(
      and(
        eq(productLicences.organizationId, organizationId),
        eq(productLicences.id, licenceId),
      ),
    );

  /**
   * Shared, against the exclusive lock an edit to the licence takes. A
   * withdrawal saved at the same moment either waits for this release or is
   * seen by it, never half of each. Two releases under one licence share the
   * lock and do not wait for each other.
   */
  const [row] = options.lock ? await query.for('share') : await query;

  // The recipe is this organization's and attaching checked the licence
  // was too (ADR-040), so a miss here is a broken record, not a bad request.
  if (!row)
    throw new NotFoundException(
      t({ id: 'production.suchLicence', defaultMessage: 'No such licence' }),
    );

  const { isActive, ...licence } = row;
  const status = licenceStatus({ ...licence, isActive });

  return { licence, status, outcome: releaseOutcome(status, policy) };
}

/** What a run records about its licence at release. */
export interface LicenceAtRelease {
  licenceStatusAtRelease: ReleaseLicenceStatus;
  licenceOverriddenBy: string | null;
  licenceOverrideReason: string | null;
}

/**
 * Release's verdict on a check, before anything is written: either what to
 * record, or a 409 that says what is wrong and what would allow it.
 *
 * An override sent when none is needed — the licence was renewed between
 * opening the dialog and pressing Release — is ignored and nothing is
 * recorded, so a run never claims an override that changed nothing. One
 * sent against a refusal changes nothing either: block means block.
 */
export function settleLicence(
  check: LicenceCheck,
  override: { reason: string } | null | undefined,
  actorId: string,
): LicenceAtRelease {
  if (check.outcome === 'block') {
    throw new ConflictException(refusal(check));
  }

  if (check.outcome === 'override') {
    if (!override) {
      throw new ConflictException(
        t(
          {
            id: 'production.licence.needsOverride',
            defaultMessage:
              '{refusal} without an override — someone holding production.override_licence can release it with a reason',
          },
          // A sentence of its own, rendered in the same language.
          { refusal: refusal(check) },
        ),
      );
    }

    return {
      licenceStatusAtRelease: recordedStatus(check.status),
      licenceOverriddenBy: actorId,
      licenceOverrideReason: override.reason,
    };
  }

  return {
    licenceStatusAtRelease: recordedStatus(check.status),
    licenceOverriddenBy: null,
    licenceOverrideReason: null,
  };
}

/**
 * Names the licence and the day that matters, so the message says what to
 * fix: renew it, wait for it, or attach one. Days as stored, YYYY-MM-DD,
 * which read the same in every locale and are what the licence was entered
 * as.
 */
function refusal({ licence, status }: LicenceCheck): Translatable {
  if (!licence) {
    return t({
      id: 'production.licence.missing',
      defaultMessage:
        'This recipe carries no licence, and this organization requires one to release a run',
    });
  }

  // Data, the same in every language.
  const name = `${licence.number} (${licence.authority})`;

  switch (status) {
    case 'withdrawn':
      return t(
        {
          id: 'production.licence.withdrawn',
          defaultMessage:
            '{name} has been withdrawn, so nothing can be made under it',
        },
        { name },
      );
    case 'not_in_force':
      return t(
        {
          id: 'production.licence.notInForce',
          defaultMessage:
            '{name} is not in force until {day}, so this run cannot be released under it',
        },
        {
          name,
          day:
            licence.issuedAt ??
            t({
              id: 'production.licence.laterDate',
              defaultMessage: 'a later date',
            }),
        },
      );
    case 'expired':
      return t(
        {
          id: 'production.licence.expired',
          defaultMessage:
            '{name} expired on {day}, so this run cannot be released under it',
        },
        {
          name,
          day:
            licence.expiresAt ??
            t({
              id: 'production.licence.unknownDate',
              defaultMessage: 'an unknown date',
            }),
        },
      );
    default:
      return t(
        {
          id: 'production.licence.cannotRelease',
          defaultMessage: '{name} cannot be released under',
        },
        { name },
      );
  }
}
