import { IsIn } from 'class-validator';

import { SUPPORTED_LOCALES } from '../locales';

/**
 * One of the languages the app speaks (ADR-054). Exact tags only: `fr`
 * and `zh` are refused rather than guessed, because a document stores the
 * tag it was printed in and must name a catalogue that exists.
 *
 * Put beside IsOptional where null means "none chosen", and beside a
 * ValidateIf where the field may be left out but never cleared.
 */
export const IsLocale = () => IsIn(SUPPORTED_LOCALES);
