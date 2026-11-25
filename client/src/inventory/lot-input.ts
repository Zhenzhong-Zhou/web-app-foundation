import { type RefObject, useEffect } from 'react';
import type { IntlShape } from 'react-intl';

import type {
  ErrorDetails,
  Lot,
  MovementLotDto,
  NumberingEnvelope,
} from '../api/types.gen';
import { hasCode } from '../lib/api';
import type { ExpiryKind } from '../lib/api-names';
import { formatNumber } from '../lib/numbering';
import { useResource } from '../lib/use-resource';

/**
 * The lot as the form holds it (ADR-094): a code typed as printed, or one
 * made for us when the write is saved; the supplier's lot beside a made
 * code; and the expiry, null until the person chooses one, the start
 * shown in its place (`chosenExpiry`).
 */
export type LotInput = {
  made: boolean;
  code: string;
  supplierLot: string;
  expiry: ExpiryKind | null;
  /** As the date input gives it, YYYY-MM-DD (ADR-052). */
  expiresAt: string;
};

export const NO_LOT: LotInput = {
  made: false,
  code: '',
  supplierLot: '',
  expiry: null,
  expiresAt: '',
};

/** What the lot fields say is missing, each at its field (#310). */
export type LotErrors = Partial<Record<'code' | 'expiry' | 'day', string>>;

/**
 * The item's lots, newest first, for the lot fields to say whether a
 * typed code is a lot it has (R10) and where Expires starts (R8). `known`
 * false where they could not be read, or the reader may not see stock
 * (ADR-080): the code is typed all the same, and nothing is said of it.
 */
export function useItemLots(variantId: string | null): {
  lots: Lot[];
  known: boolean;
} {
  const { data } = useResource<Lot[]>(
    variantId ? `/stock/lots?variantId=${variantId}` : null,
  );
  return { lots: data ?? [], known: data !== null };
}

/**
 * The code the lot series would make now, "L-2026-11-21-3", as Make a
 * code for us and Start tracking lots show it (ADR-094, R3): another lot
 * made first takes it. Null without the numbering, which a role may not
 * read.
 */
export function useNextLotCode(): string | null {
  const { data } = useResource<NumberingEnvelope>('/organization/numbering');
  const series = data?.numbering.lot;
  return series && data
    ? formatNumber(
        series.prefix,
        series.digits,
        series.next[series.reset],
        data.numbering.today,
      )
    : null;
}

/** A typed lot code as the server matches it: trimmed and in capitals. */
export function cleanCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * The lot a typed code names among the item's, matched as the server
 * matches it (cleanCode; MovementLotDto).
 */
export function existingLot(
  input: LotInput,
  lots: readonly Lot[],
): Lot | undefined {
  const code = cleanCode(input.code);
  return input.made || !code
    ? undefined
    : lots.find((lot) => lot.code === code);
}

/** A lot of the item, as Use {code} takes it: its id and its code now. */
export type LotToUse = Pick<Lot, 'id' | 'code'>;

/**
 * The lot whose former code a typed code is (ADR-094 amended, R11, 4a),
 * where no lot has it now: a code is never given to a second lot, so the
 * field refuses it while it is typed, naming that lot. A lot that took
 * its own former code back has it now, and is the lot the code names.
 */
export function formerOwner(
  input: LotInput,
  lots: readonly Lot[],
): Lot | undefined {
  const code = cleanCode(input.code);
  return input.made || !code || existingLot(input, lots)
    ? undefined
    : lots.find((lot) => lot.formerCodes.includes(code));
}

/**
 * The refusal, while typing, of another lot's former code (R11, 4a). The
 * server's, on a write, also says until when; the lots the field holds
 * carry the codes alone (F2).
 */
export function formerCodeMessage(
  input: LotInput,
  owner: LotToUse,
  intl: IntlShape,
): string {
  return intl.formatMessage(
    {
      id: 'inventory.lot.formerCode',
      defaultMessage:
        '{code} was the code of lot {lot}. A code is never given to a second lot.',
    },
    { code: cleanCode(input.code), lot: owner.code },
  );
}

/** A write's answer as `useSubmit` gives it, and how to clear it. */
export interface Submitted {
  error: string | null;
  errorCode: string | null;
  errorDetails: ErrorDetails | null;
  reset: () => void;
}

/** A write refused for another lot's former code, as a form shows it. */
export interface FormerCodeRefusal {
  /** Refused so: the form's own error says nothing, the code's field does. */
  refused: boolean;
  /** The refusal, for the lot's code field; undefined for any other answer. */
  error: string | undefined;
  /** The lot that had the code, when the server names it, for Use {code}. */
  refusedFor: LotToUse | undefined;
  /** Clears the refusal as the code changes: it was of the code sent. */
  clear: () => void;
}

/**
 * A write refused for another lot's former code (`lot_code_former`, R11):
 * said at the lot's code, never above the form, focus going there as on
 * every refusal at a field; the lot that had the code, when the server
 * names it, for Use {code}. Every dialog that sends a typed code reads it
 * here (review 54).
 */
export function useFormerCodeRefusal(
  submitted: Submitted,
  codeRef: RefObject<HTMLInputElement | null>,
): FormerCodeRefusal {
  const { error, errorCode, errorDetails, reset } = submitted;
  const refused = hasCode(errorCode, 'lot_code_former');
  useEffect(() => {
    if (refused) codeRef.current?.focus();
  }, [refused, codeRef]);
  return {
    refused,
    error: refused ? (error ?? undefined) : undefined,
    refusedFor:
      refused && errorDetails?.lotId && errorDetails.lotCode
        ? { id: errorDetails.lotId, code: errorDetails.lotCode }
        : undefined,
    clear: () => {
      if (refused) reset();
    },
  };
}

/**
 * Where Expires starts (R8, E6): as the item's last lot had it, a first
 * lot with none chosen; Not known yet for a code made for us, since a
 * delivery that shows no lot rarely shows its expiry (ADR-094's table).
 * A choice the person made stays whichever the code.
 */
export function chosenExpiry(
  input: LotInput,
  lots: readonly Lot[],
): ExpiryKind | null {
  if (input.expiry) return input.expiry;
  if (input.made) return 'unknown';
  return lots[0]?.expiry ?? null;
}

/**
 * A lot's expiry as a pile gives it (ADR-094, R8): its kind, or from a
 * tab's read of before the kind, a day meaning a date and none no expiry.
 */
export function expiryKindOf(lot: {
  lotExpiry: ExpiryKind | null;
  lotExpiresAt: string | null;
}): ExpiryKind {
  return lot.lotExpiry ?? (lot.lotExpiresAt ? 'date' : 'none');
}

/** The day a write sends: only for On a date, never left over from it. */
export function dayFor(
  expiry: ExpiryKind | null | undefined,
  day: string,
): string | undefined {
  return expiry === 'date' ? day : undefined;
}

/** On a date with no day: what its field says. */
export function dayError(
  expiry: ExpiryKind | null | undefined,
  day: string,
  intl: IntlShape,
): string | undefined {
  return expiry === 'date' && !day
    ? intl.formatMessage({
        id: 'inventory.lot.dayMissing',
        defaultMessage: 'Type the day the lot expires.',
      })
    : undefined;
}

/**
 * What the lot fields still need, in the app's language: a code typed or
 * made, and for a new lot when it expires, with its day for a date. An
 * existing lot keeps its own expiry, so none is asked; `mustBeNew`, as
 * Count it in's new lot, asks one whatever the code.
 */
export function lotErrors(
  input: LotInput,
  lots: readonly Lot[],
  intl: IntlShape,
  mustBeNew = false,
): LotErrors {
  const errors: LotErrors = {};
  if (!input.made && !input.code.trim()) {
    errors.code = intl.formatMessage({
      id: 'inventory.lot.numberMissing',
      defaultMessage: 'Type the lot number as printed, or make a code for us.',
    });
  }
  // Another lot's former code, refused before the write (R11, 4a); the
  // server's refusal is what holds.
  const owner = formerOwner(input, lots);
  if (owner) {
    errors.code = formerCodeMessage(input, owner, intl);
    return errors;
  }
  if (!mustBeNew && existingLot(input, lots)) return errors;

  const expiry = chosenExpiry(input, lots);
  if (!expiry) {
    errors.expiry = intl.formatMessage({
      id: 'inventory.lot.expiryMissing',
      defaultMessage: 'Choose when the lot expires.',
    });
  } else {
    errors.day = dayError(expiry, input.expiresAt, intl);
  }
  return errors;
}

/**
 * The write's lot (MovementLotDto): made for us, with the supplier's lot;
 * a typed code the item has, by its code alone, since a second delivery
 * never rewrites the first's expiry; or a new code with its expiry.
 * Check it with `lotErrors` first.
 */
export function lotRequest(
  input: LotInput,
  lots: readonly Lot[],
  mustBeNew = false,
): MovementLotDto {
  const expiry = chosenExpiry(input, lots) ?? undefined;
  const expiresAt = dayFor(expiry, input.expiresAt);
  if (input.made) {
    return {
      makeCode: true,
      supplierLot: input.supplierLot.trim() || undefined,
      expiry,
      expiresAt,
    };
  }
  if (!mustBeNew && existingLot(input, lots)) return { code: input.code };
  return {
    code: input.code,
    ...(mustBeNew ? { mustBeNew: true } : {}),
    expiry,
    expiresAt,
  };
}
