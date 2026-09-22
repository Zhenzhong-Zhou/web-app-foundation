import { describe, expect, it } from 'vitest';

import { summarise } from './audit-format';

describe('summarise', () => {
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
