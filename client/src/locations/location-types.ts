import { defineMessages, type IntlShape } from 'react-intl';

/**
 * What a location is called by its depth, outermost first (ADR-024). A
 * label for reading, not a rule; stored as these keys, named in the
 * reader's language (ADR-054).
 */
export const LOCATION_TYPES = [
  'site',
  'zone',
  'aisle',
  'shelf',
  'bin',
] as const;

const LABELS = defineMessages({
  site: { id: 'locations.type.site', defaultMessage: 'Site' },
  zone: { id: 'locations.type.zone', defaultMessage: 'Zone' },
  aisle: { id: 'locations.type.aisle', defaultMessage: 'Aisle' },
  shelf: { id: 'locations.type.shelf', defaultMessage: 'Shelf' },
  bin: { id: 'locations.type.bin', defaultMessage: 'Bin' },
});

/** A type's name; one this client does not know is shown as it came. */
export function locationTypeLabel(type: string, intl: IntlShape): string {
  return type in LABELS
    ? intl.formatMessage(LABELS[type as keyof typeof LABELS])
    : type;
}
