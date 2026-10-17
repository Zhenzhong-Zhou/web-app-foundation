import { intl } from '../i18n/intl';
import { cityOf, currentName, zoneName } from './time-zone';

/**
 * A zone as people read it (ADR-072): its own name in the reader's
 * language, then its city, "Pacific Time (Vancouver)", "中国标准时间
 * （Shanghai）". The picker, Home's note and the audit log all say it so.
 * Through the shared intl object rather than a hook, so the audit log's
 * plain functions can call it. Under the zone's current name, so a city
 * reads as the server stores it, Kolkata, even where an older name was
 * recorded or a browser lists one.
 */
export function zoneLabel(zone: string): string {
  const named = currentName(zone);
  return intl().formatMessage(
    { id: 'timeZones.label', defaultMessage: '{zone} ({city})' },
    { zone: zoneName(named, intl().locale), city: cityOf(named) },
  );
}
