import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { type QuickFilter, QuickFilterPill } from './filter-row';

const pill = (over: Partial<QuickFilter>) =>
  render(
    <QuickFilterPill
      filter={{
        id: 'low',
        label: 'Low stock',
        pressed: false,
        onToggle: () => undefined,
        ...over,
      }}
    />,
  );

/**
 * A quick filter's count says what it counts (108a, #609): "Low stock · 8
 * codes", "Expiring soon · 4 lots", by each language's plural, the noun
 * the list's own, so two screens' numbers never read as the same kind.
 */
describe("a quick filter's count", () => {
  afterEach(() => localStorage.removeItem('language'));

  it('says what it counts beside the number, by the plural', () => {
    pill({ count: 8, of: 'code' });
    expect(
      screen.getByRole('button', { name: 'Low stock · 8 codes' }),
    ).toHaveTextContent(/^Low stock · 8 codes$/);
  });

  it.each([
    ['code', 1, 'Low stock · 1 code'],
    ['lot', 4, 'Low stock · 4 lots'],
    ['lot', 1, 'Low stock · 1 lot'],
    ['item', 0, 'Low stock · 0 items'],
    ['item', 1, 'Low stock · 1 item'],
  ] as const)('counts %ss: %i reads "%s"', (of, count, name) => {
    pill({ count, of });
    expect(screen.getByRole('button', { name })).toBeVisible();
  });

  it.each([
    ['fr-CA', 'Stock bas', 'code', 8, 'Stock bas · 8 codes'],
    ['fr-CA', 'Expire bientôt', 'lot', 1, 'Expire bientôt · 1 lot'],
    ['fr-CA', 'Abandonné', 'item', 0, 'Abandonné · 0 article'],
    ['zh-Hans', '库存不足', 'code', 8, '库存不足 · 8 个编码'],
    ['zh-Hans', '即将过期', 'lot', 4, '即将过期 · 4 个批次'],
    ['zh-Hans', '已停用', 'item', 2, '已停用 · 2 个物品'],
  ] as const)(
    'in %s, %s reads its noun',
    async (language, label, of, count, name) => {
      localStorage.setItem('language', language);
      pill({ label, count, of });
      await waitFor(() =>
        expect(screen.getByRole('button')).toHaveAccessibleName(name),
      );
    },
  );

  // A list whose rows need no noun keeps the number alone.
  it('keeps the number alone without a noun', () => {
    pill({ label: 'Retired', count: 3 });
    expect(screen.getByRole('button')).toHaveTextContent(/^Retired\s*3$/);
  });

  // Until the counts are read, the label alone.
  it('says the label alone until its count is read', () => {
    pill({ of: 'code' });
    expect(screen.getByRole('button')).toHaveAccessibleName('Low stock');
  });
});
