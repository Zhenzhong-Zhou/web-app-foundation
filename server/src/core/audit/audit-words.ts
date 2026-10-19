import type { Locale } from '../../common/locales';
import { canonicalTimeZone, dayIn } from '../../common/today';
import { t, type Translatable, translate } from '../../i18n/translate';
import { fieldOf, KIND_WORDS, ROLE_NAMES, WORDS } from './audit-fields';
import { ACTION_NAMES, RESOURCE_TYPE_NAMES } from './audit-names';
import {
  isChange,
  REFERENCE_KINDS,
  type ReferenceKind,
  UUID,
} from './audit-references';
import type {
  AuditDetail,
  AuditLink,
  AuditValue,
} from './dto/audit-response.dto';

export interface AuditWords {
  actionName: string;
  resourceTypeName: string | null;
  details: AuditDetail[];
}

/**
 * Who an entry is worded for: their language; the organization's zone,
 * whose days a filter on moments names (ADR-072); and who is reading, so
 * a filter on them reads as "you" (ADR-076).
 */
export interface Reading {
  locale: Locale;
  timeZone: string;
  readerId: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function isNamed(value: unknown): value is { id: string; label: unknown } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'id' in value &&
    'label' in value &&
    typeof value.id === 'string'
  );
}

/**
 * Words an audit entry in one language (ADR-076): its action, the kind of
 * record it is about, and each recorded field. No UUID, no code name and
 * no stored code reaches the result: a reference reads as its name, or as
 * its kind in words when it has none.
 */
export function wordEntry(
  entry: {
    action: string;
    resourceType: string | null;
    payload: Record<string, unknown> | null;
  },
  reading: Reading,
): AuditWords {
  const { locale } = reading;
  const say = (message: Translatable) => translate(message, locale);

  const type = entry.resourceType
    ? (RESOURCE_TYPE_NAMES[entry.resourceType] ?? WORDS.typeRecord)
    : null;

  return {
    actionName: actionNameOf(entry.action, locale),
    resourceTypeName: type ? say(type) : null,
    details: detailsOf(entry.payload, reading),
  };
}

function detailsOf(
  payload: Record<string, unknown> | null,
  reading: Reading,
): AuditDetail[] {
  const { locale } = reading;
  if (!payload) return [];
  const say = (message: Translatable) => translate(message, locale);
  const details: AuditDetail[] = [];
  const entries = Object.entries(payload);

  for (const [key, value] of entries) {
    const field = say(fieldOf(key)?.name ?? WORDS.detail);

    if (key !== 'filters' && isChange(value)) {
      // A form sends every field it shows: a value that did not move is
      // not news beside the one that did.
      if (JSON.stringify(value.from) === JSON.stringify(value.to)) continue;
      details.push({
        field,
        changed: true,
        from: valueOf(key, value.from, reading),
        value: valueOf(key, value.to, reading),
      });
    } else {
      details.push({
        field,
        changed: false,
        from: null,
        value: valueOf(key, value, reading),
      });
    }
  }

  // Every field recorded, and none moved: rows from before the interceptor
  // skipped such saves.
  if (details.length === 0 && entries.length > 0) {
    details.push({
      field: say(WORDS.noChanges),
      changed: false,
      from: null,
      value: null,
    });
  }
  return details;
}

/** A value in words, or null for none. */
function valueOf(
  key: string,
  value: unknown,
  reading: Reading,
): AuditValue | null {
  const { locale, timeZone } = reading;
  const say = (message: Translatable) => translate(message, locale);
  const read = fieldOf(key)?.read ?? 'text';

  if (typeof read === 'object' && 'file' in read) {
    if (read.file) return { text: say(read.file) };
    return { text: say(value ? WORDS.logoReplaced : WORDS.logoRemoved) };
  }
  if (value === null || value === undefined || value === '') return null;

  if (read === 'reference' || isNamed(value)) {
    return referenceOf(key, value, reading);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => valueOf(key, item, reading)?.text)
      .filter((text): text is string => Boolean(text));
    return parts.length > 0
      ? { text: new Intl.ListFormat(locale).format(parts) }
      : null;
  }
  if (typeof value === 'object') {
    return {
      text: objectText(value as Record<string, unknown>, reading),
    };
  }
  // A payload is JSON: what is left is a string, a number or a boolean.
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    return null;
  }

  const raw = String(value);
  if (typeof read === 'object' && 'set' in read) {
    const word = read.set[raw];
    return { text: word ? say(word) : raw };
  }
  switch (read) {
    case 'boolean':
      return {
        text: say(raw === 'true' ? WORDS.yes : WORDS.no),
      };
    case 'language':
      return { text: displayName(locale, 'language', raw) };
    case 'country':
      return { text: displayName(locale, 'region', raw) };
    case 'timeZone':
      return { text: zoneLabel(locale, raw) };
    case 'action': {
      const name = ACTION_NAMES[raw as keyof typeof ACTION_NAMES];
      return { text: name ? say(name) : raw };
    }
  }
  if (UUID.test(raw)) return { text: say(KIND_WORDS.record) };
  if (MOMENT.test(raw) && read !== 'day' && read !== 'dayAfter') {
    return { text: raw, at: raw };
  }
  if (DAY.test(raw) || MOMENT.test(raw)) {
    // A range's end is the start of the day after its last (ADR-057): the
    // person chose the day before it.
    const day =
      read === 'dayAfter'
        ? dayBefore(dayOf(raw, timeZone))
        : dayOf(raw, timeZone);
    return { text: day, day };
  }
  return { text: raw };
}

/**
 * The day a value names. A day held as a moment: before ADR-052, its UTC
 * midnight; on a list of moments' filter, the organization's midnight
 * (ADR-072), which in Shanghai falls on the UTC day before.
 */
function dayOf(raw: string, timeZone: string): string {
  if (DAY.test(raw)) return raw;
  return raw.endsWith('T00:00:00.000Z')
    ? raw.slice(0, 10)
    : dayIn(timeZone, raw);
}

/** The calendar day before a YYYY-MM-DD day (ADR-052). */
function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * A reference: its name, linked; or, when it names nothing (an old row, or
 * a person, whom the log never names), its kind in words.
 */
function referenceOf(
  key: string,
  value: unknown,
  reading: Reading,
): AuditValue | null {
  const { locale, readerId } = reading;
  const say = (message: Translatable) => translate(message, locale);
  const kind: ReferenceKind =
    REFERENCE_KINDS[key as keyof typeof REFERENCE_KINDS] ?? 'record';
  const id = isNamed(value)
    ? value.id
    : typeof value === 'string' && UUID.test(value)
      ? value
      : null;
  const label = isNamed(value) ? value.label : null;

  let text: string;
  if (typeof label === 'string' && label !== '') {
    const role =
      kind === 'role'
        ? (ROLE_NAMES as Partial<Record<string, Translatable>>)[label]
        : undefined;
    text = role ? say(role) : label;
  } else if (id === null && typeof value === 'string') {
    text = value;
  } else if (kind === 'person' && id !== null && id === readerId) {
    // The reader themselves, as on Your activity: never their name.
    text = say(WORDS.you);
  } else {
    text = say(KIND_WORDS[kind]);
  }

  return { text, link: linkOf(kind, id, value) };
}

/**
 * Where a reference links: its own record; a shipment, which has no page,
 * its order, by the id stored beside it, so a row written before that is
 * plain text; a person or a record of no stated kind, nowhere.
 */
function linkOf(
  kind: ReferenceKind,
  id: string | null,
  value: unknown,
): AuditLink | null {
  if (kind === 'shipment') {
    const orderId = isNamed(value) && 'orderId' in value ? value.orderId : null;
    return typeof orderId === 'string' && UUID.test(orderId)
      ? { kind: 'order', id: orderId }
      : null;
  }
  if (id === null || kind === 'person' || kind === 'record') return null;
  return { kind, id };
}

/** An object's own fields, each named and worded, on one line. */
function objectText(value: Record<string, unknown>, reading: Reading): string {
  const { locale } = reading;
  const say = (message: Translatable) => translate(message, locale);
  return (
    Object.entries(value)
      // A filter on a list is shown by what it filters, never as the list's
      // own id, which the row already names.
      .filter(([key]) => key !== 'id')
      .map(([key, inner]) => {
        const text = valueOf(key, inner, reading)?.text;
        if (!text) return null;
        // A line reads as its item first, then its other fields.
        return key === 'lineId' || key === 'variantId'
          ? text
          : `${say(fieldOf(key)?.name ?? WORDS.detail)} ${text}`;
      })
      .filter((part): part is string => part !== null)
      .join(', ')
  );
}

function displayName(
  locale: Locale,
  type: 'language' | 'region',
  code: string,
): string {
  try {
    return new Intl.DisplayNames([locale], { type }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * A zone as people read it (ADR-072), as the client's zoneLabel says it:
 * its generic name in the reader's language, then the city its id ends
 * in, "Pacific Time (Vancouver)". Under its current name, so an older one
 * the request sent reads as the zone does now; the id itself when Intl
 * cannot name it.
 */
function zoneLabel(locale: Locale, zone: string): string {
  const current = canonicalTimeZone(zone);
  if (!current) return zone;
  try {
    const name = new Intl.DateTimeFormat(locale, {
      timeZone: current,
      timeZoneName: 'longGeneric',
    })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
    if (!name) return zone;
    const city = (current.split('/').pop() ?? current).replace(/_/g, ' ');
    return translate(
      t(
        { id: 'audit.value.timeZone', defaultMessage: '{zone} ({city})' },
        { zone: name, city },
      ),
      locale,
    );
  } catch {
    return zone;
  }
}

/** An action's name in one language, for the audit log's filter. */
export function actionNameOf(action: string, locale: Locale): string {
  const name = ACTION_NAMES[action as keyof typeof ACTION_NAMES];
  return translate(name ?? WORDS.detail, locale);
}
