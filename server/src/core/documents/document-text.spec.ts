import { describe, expect, it } from 'vitest';

import { t } from '../../i18n/translate';
import { documentText, formattingTag } from './document-text';
import { formatDay, formatMoney, formatQuantity } from './format';

describe('documentText', () => {
  it('says a label in each language, first first', () => {
    const doc = documentText('fr-CA', 'en', 'CA');

    expect(
      doc.label(t({ id: 'documents.invoice', defaultMessage: 'Invoice' })),
    ).toBe('Facture / Invoice');
    expect(doc.locale).toBe('fr-CA');
  });

  it('says it once when both languages say the same', () => {
    const doc = documentText('zh-Hans', 'en', 'CN');

    expect(
      doc.label(() =>
        t({ id: 'documents.rate', defaultMessage: '{value}%' }, { value: '5' }),
      ),
    ).toBe('5%');
  });

  it('formats in the seller’s country where the language names none', () => {
    expect(formattingTag('en', 'CA')).toBe('en-CA');
    expect(formattingTag('zh-Hans', 'CN')).toBe('zh-Hans-CN');
    expect(formattingTag('fr-CA', 'US')).toBe('fr-CA');
    expect(formattingTag('en', null)).toBe('en');
  });
});

describe('format', () => {
  it('writes money once, the first language’s way', () => {
    expect(formatMoney('12.5', 'CAD', 'en-CA')).toBe('$12.50');
    expect(formatMoney('12.5', 'CAD', 'fr-CA')).toMatch(/^12,50\s\$$/);
    expect(formatMoney(null, 'CAD', 'en-CA')).toBe('—');
  });

  it('drops a quantity’s padding zeros, with the language’s decimal mark', () => {
    expect(formatQuantity('600.0000', 'en-CA')).toBe('600');
    expect(formatQuantity('9.9750', 'fr-CA')).toBe('9,975');
    expect(formatQuantity('12', 'en-CA')).toBe('12');
  });

  it('reads a day in UTC, so a stored date never moves', () => {
    expect(formatDay('2026-10-15', 'zh-Hans-CN')).toBe('2026年10月15日');
  });

  // A moment's day is the organization's (ADR-072): 6:30 pm on 16 October
  // in Vancouver is already the 17th in UTC.
  it('reads a moment on the day it fell where the organization is', () => {
    const shipped = '2026-10-17T01:30:00.000Z';
    expect(
      documentText('en', null, 'CA', 'America/Vancouver').dayOf(shipped),
    ).toBe(formatDay('2026-10-16', 'en-CA'));
    expect(documentText('en', null, 'CA').dayOf(shipped)).toBe(
      formatDay('2026-10-17', 'en-CA'),
    );
  });
});
