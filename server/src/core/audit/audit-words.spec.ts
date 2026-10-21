import { SUPPORTED_LOCALES } from '../../common/locales';
import { AUDIT_ACTIONS } from './audit-actions';
import { AUDIT_FIELDS, type FieldSpec } from './audit-fields';
import { REFERENCE_KINDS } from './audit-references';
import { actionNameOf, type Reading, wordEntry } from './audit-words';

const ID = '01a1522b-9d85-7367-8cdd-796c3ee07a68';
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
/** A word in the code's own casing: taxCodeId, deliverToId. */
const CAMEL = /\b[a-z]+[A-Z][A-Za-z]*\b/;

const IN_ENGLISH: Reading = { locale: 'en', timeZone: 'UTC', readerId: null };

/** A field as an organization's settings would record it. */
function entry(payload: Record<string, unknown>) {
  return {
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    payload,
  };
}

/** Each value a reader may be given, as a payload holds it. */
function samplesOf(spec: FieldSpec): unknown[] {
  const { read } = spec;
  if (typeof read === 'object') {
    return 'set' in read ? Object.keys(read.set) : [ID, null];
  }
  switch (read) {
    case 'reference':
      // Named as written (ADR-076), named nothing, and an old row's bare id.
      return [{ id: ID, label: 'SO-000009' }, { id: ID, label: null }, ID];
    case 'day':
      // A day; one stored as UTC midnight before ADR-052; an organization's
      // midnight, as a filter on a list of moments sends it.
      return ['2026-10-18', '2026-10-18T00:00:00.000Z', '2026-09-30T16:00:00Z'];
    case 'dayAfter':
      // A range's end: the organization's midnight after its last day, and
      // UTC midnight.
      return ['2026-10-08T07:00:00.000Z', '2026-10-08T00:00:00.000Z'];
    case 'boolean':
      return [true, false];
    case 'language':
      return ['fr-CA', ['en', 'zh-Hans']];
    case 'country':
      return ['CA'];
    case 'timeZone':
      return ['America/Vancouver'];
    case 'action':
      return [AUDIT_ACTIONS.ORDER_CREATED];
    case 'permission':
      return [['orders.view', 'orders.view_prices']];
    case 'text':
      return ['Spring catalogue', '12.5000', ID];
  }
}

/** The fields that hold a shape rather than a value. */
const SHAPED: Record<string, unknown[]> = {
  lines: [
    [
      {
        lineId: { id: ID, label: 'MAGCAP-60' },
        quantity: '2',
        resolution: 'replace',
      },
    ],
  ],
  filters: [
    { id: ID, actorId: { id: ID, label: null }, partnerId: ID, from: ID },
  ],
};

/**
 * One vocabulary the code cannot skip (ADR-076): every declared field, in
 * each language, as a value and as a change, reads with no UUID, no code
 * name and no stored code.
 */
describe('wordEntry, every declared field', () => {
  const fields = Object.entries(AUDIT_FIELDS) as [string, FieldSpec][];

  it.each(SUPPORTED_LOCALES)('reads in words, in %s', (locale) => {
    const reading: Reading = {
      locale,
      timeZone: 'Asia/Shanghai',
      readerId: null,
    };

    for (const [key, spec] of fields) {
      for (const sample of [...samplesOf(spec), ...(SHAPED[key] ?? [])]) {
        for (const payload of [
          { [key]: sample },
          { [key]: { from: null, to: sample } },
        ]) {
          const { details } = wordEntry(entry(payload), reading);
          for (const detail of details) {
            expect(detail.field, key).not.toBe(key);
            for (const text of [
              detail.field,
              detail.from?.text,
              detail.value?.text,
            ]) {
              if (!text) continue;
              expect(text, `${key}: ${JSON.stringify(sample)}`).not.toMatch(
                UUID,
              );
              expect(text, `${key}: ${JSON.stringify(sample)}`).not.toMatch(
                CAMEL,
              );
            }
          }
        }
      }

      const { read } = spec;
      if (typeof read === 'object' && 'set' in read) {
        for (const code of Object.keys(read.set)) {
          const [detail] = wordEntry(entry({ [key]: code }), reading).details;
          expect(detail.value?.text, `${key}: ${code}`).not.toBe(code);
        }
      }
    }
  });

  it('declares as a reference every key the write side names, and no other', () => {
    const declared = fields
      .filter(([, spec]) => spec.read === 'reference')
      .map(([key]) => key)
      .sort();
    expect(declared).toEqual(Object.keys(REFERENCE_KINDS).sort());
  });

  it.each(SUPPORTED_LOCALES)('names every action, in %s', (locale) => {
    for (const action of Object.values(AUDIT_ACTIONS)) {
      const name = actionNameOf(action, locale);
      expect(name, action).not.toBe(action);
      expect(name, action).not.toMatch(/[a-z][._][a-z]/);
      expect(name, action).not.toMatch(CAMEL);
    }
  });
});

/**
 * A day reads as the day it names (ADR-052, ADR-072): a filter on a list of
 * moments is the organization's midnight, an old day its UTC midnight.
 */
describe('wordEntry, a day', () => {
  it('reads a filter on moments as the organization’s day', () => {
    const { details } = wordEntry(
      entry({ list: 'audit', filters: { from: '2026-09-30T16:00:00.000Z' } }),
      { locale: 'en', timeZone: 'Asia/Shanghai', readerId: null },
    );
    const filters = details.find((detail) => detail.field === 'Filters');
    expect(filters?.value?.text).toBe('From 2026-10-01');
  });

  it('reads a filter’s end, the start of the day after, as the last day', () => {
    const { details } = wordEntry(
      entry({
        list: 'audit',
        filters: {
          from: '2026-09-30T16:00:00.000Z',
          until: '2026-10-07T16:00:00.000Z',
        },
      }),
      { locale: 'en', timeZone: 'Asia/Shanghai', readerId: null },
    );
    const filters = details.find((detail) => detail.field === 'Filters');
    expect(filters?.value?.text).toBe('From 2026-10-01, To 2026-10-07');
  });

  it('reads a day stored as UTC midnight, before ADR-052, as that day', () => {
    const [detail] = wordEntry(entry({ dueDate: '2026-11-18T00:00:00.000Z' }), {
      locale: 'en',
      timeZone: 'America/Vancouver',
      readerId: null,
    }).details;
    expect(detail.value).toEqual({ text: '2026-11-18', day: '2026-11-18' });
  });
});

/** No person is named (ADR-038): one filtered on is "you" to themselves. */
describe('wordEntry, a person', () => {
  const yours = entry({
    list: 'your-activity',
    filters: { actorId: { id: ID, label: null } },
  });

  it('reads a filter on the reader as "you", and on anyone else as one person', () => {
    const mine = wordEntry(yours, { ...IN_ENGLISH, readerId: ID }).details;
    const theirs = wordEntry(yours, IN_ENGLISH).details;

    const filters = (details: typeof mine) =>
      details.find((detail) => detail.field === 'Filters')?.value?.text;
    expect(filters(mine)).toBe('Person you');
    expect(filters(theirs)).toBe('Person one person');
  });
});

/** A shipment has no page: it links to its order (ADR-076). */
describe('wordEntry, a shipment', () => {
  const ORDER = '01a15178-4bc8-7967-a6f1-d72516cc29ae';

  it('links to its order, by the id stored beside it', () => {
    const [detail] = wordEntry(
      entry({ shipmentId: { id: ID, label: 'SO-000009', orderId: ORDER } }),
      IN_ENGLISH,
    ).details;
    expect(detail.value).toEqual({
      text: 'SO-000009',
      link: { kind: 'order', id: ORDER },
    });
  });

  it('reads as plain text when written before its order was stored', () => {
    const [detail] = wordEntry(
      entry({ shipmentId: { id: ID, label: 'SO-000009' } }),
      IN_ENGLISH,
    ).details;
    expect(detail.value).toEqual({ text: 'SO-000009', link: null });
  });
});

/** A time zone changed on the organization, as its route records it. */
function zoneChange(from: string, to: string) {
  return entry({ timeZone: { from, to } });
}

/**
 * A zone reads as the client's picker says it (ADR-072, ADR-076): its name
 * in the reader's language, then its city, never its id.
 */
describe('wordEntry, a time zone', () => {
  it('names the zone, then its city', () => {
    const [detail] = wordEntry(
      zoneChange('UTC', 'America/Vancouver'),
      IN_ENGLISH,
    ).details;

    expect(detail.field).toBe('Time zone');
    expect(detail.value?.text).toBe('Pacific Time (Vancouver)');
  });

  it('reads an older name as the zone is called now', () => {
    const [detail] = wordEntry(
      zoneChange('UTC', 'Asia/Calcutta'),
      IN_ENGLISH,
    ).details;

    expect(detail.value?.text).toMatch(/\(Kolkata\)$/);
  });

  it('keeps the id when there is no zone to name', () => {
    const [detail] = wordEntry(
      zoneChange('UTC', 'Mars/Olympus_Mons'),
      IN_ENGLISH,
    ).details;

    expect(detail.value?.text).toBe('Mars/Olympus_Mons');
  });
});
