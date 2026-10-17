import { intl } from '../i18n/intl';
import { cityOf, zoneName } from './time-zone';

/**
 * A zone as people read it (ADR-072): its own name in the reader's
 * language, then its city, "Pacific Time (Vancouver)", "中国标准时间
 * （Shanghai）". The picker, Home's note and the audit log all say it so.
 * Through the shared intl object rather than a hook, so the audit log's
 * plain functions can call it.
 */
export function zoneLabel(zone: string): string {
  return intl().formatMessage(
    { id: 'timeZones.label', defaultMessage: '{zone} ({city})' },
    { zone: zoneName(zone, intl().locale), city: cityOf(zone) },
  );
}
