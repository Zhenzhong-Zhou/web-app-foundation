import { describe, expect, it } from 'vitest';

import { summarise } from './audit-format';

describe('summarise', () => {
  // What Your activity showed: "filters: [object Object]", and an image's
  // id for an image added.
  it("reads an export's filters and a gallery change in words", () => {
    const filters = summarise({
      list: 'products',
      rows: 15,
      filters: {
        from: '2026-10-01',
        to: '2026-10-09',
        actorId: '01a121bb-81d7-7b64-922a-486f6870d0a0',
      },
    });
    expect(filters).not.toContain('[object Object]');
    expect(filters).not.toContain('01a121bb');
    expect(filters).toContain('filters: from');

    expect(summarise({ filters: {} })).toBe('filters: none');
    expect(summarise({ fileId: '01a121bb-81d7-7b64-922a-486f6870d0a0' })).toBe(
      'an image added',
    );
  });

  // What the audit log showed: an unchanged reference and a raw ISO string.
  it('shows only what changed, with calendar days as days', () => {
    const shown = summarise({
      reference: { from: 'PO-1', to: 'PO-1' },
      expectedAt: {
        from: '2026-10-10T00:00:00.000Z',
        to: '2026-10-12T00:00:00.000Z',
      },
    });

    expect(shown).not.toContain('reference');
    expect(shown).not.toContain('T00:00');
    expect(shown).toMatch(/^expected at: .*10.* → .*12.*2026$/);
  });

  // Rows since ADR-052 record the day itself; older rows keep the instant.
  it('shows a day recorded as YYYY-MM-DD beside an old instant', () => {
    const shown = summarise({
      expiresAt: { from: '2026-10-10T00:00:00.000Z', to: '2026-10-12' },
    });

    expect(shown).not.toContain('T00:00');
    expect(shown).not.toContain('2026-10-12');
    expect(shown).toMatch(/^expires at: .*10.* → .*12.*2026$/);
  });

  // "set to" and "changed from" are different claims (ADR-018).
  it('keeps a bare value as a bare value', () => {
    expect(summarise({ status: 'confirmed' })).toBe('status: confirmed');
  });

  it('says when a save changed nothing', () => {
    expect(summarise({ quantityOrdered: { from: '40', to: '40' } })).toBe(
      'Saved with no changes',
    );
  });
});
