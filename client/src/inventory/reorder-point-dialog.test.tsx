import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { ReorderPointDetail, ReorderPointPreview } from '../api/types.gen';
import { apiError } from '../test/handlers';
import { server } from '../test/setup';
import {
  type ReorderOpening,
  ReorderPointDialog,
} from './reorder-point-dialog';

const D3 = {
  variantId: 'variant-d3',
  sku: 'D3-1000',
  productName: 'Vitamin D3',
  variantName: null,
  unitOfMeasure: 'each',
};

const LOW: ReorderPointPreview = {
  position: '800.0000',
  status: 'low',
  suggestion: '2000.0000',
  suggestedMultiples: '2',
  drafted: false,
  after: '2800.0000',
  afterStatus: 'enough',
};

const DETAIL: ReorderPointDetail = {
  point: {
    source: 'bought',
    reorderPoint: '2000.0000',
    rule: 'fixed',
    fixedQuantity: '1000.0000',
    maximumQuantity: null,
  },
  usable: [],
  expired: '0.0000',
  issued: '0.0000',
  coming: [],
  stillNeeded: [],
};

/** Each preview asked, its query as sent. */
function previews(
  answer: (query: URLSearchParams) => Response | Promise<Response>,
) {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get(
      '/api/v1/stock/reorder-points/:variantId/preview',
      ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(query);
        return answer(query);
      },
    ),
  );
  return asked;
}

function open(opening: ReorderOpening, onSaved = vi.fn()) {
  render(
    <ReorderPointDialog
      opening={opening}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  );
  return { onSaved };
}

const pointField = () => screen.getByRole('textbox', { name: /Reorder point/ });

describe('ReorderPointDialog', () => {
  it('asks Today once typing pauses, and says what the server works out', async () => {
    const asked = previews(() => HttpResponse.json(LOW));
    open({ kind: 'edit', item: D3, point: DETAIL.point });
    // Edit starts in the point (WCAG 2.4.3).
    await waitFor(() => expect(pointField()).toHaveFocus());

    await userEvent.clear(pointField());
    await userEvent.type(pointField(), '2000');

    expect(
      await screen.findByText(
        'Below 2,000 now, so it would suggest 2,000, 2 of 1,000.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('2,800 each')).toBeInTheDocument();
    // Opened, cleared and typed within the pause: one question, not one
    // a key.
    expect(asked.map((query) => query.get('reorderPoint'))).toEqual(['2000']);
    expect(asked[0].get('fixedQuantity')).toBe('1000');
    expect(asked[0].has('maximumQuantity')).toBe(false);
  });

  // The glossary's words for a made item (ADR-085): 建议生产, not 建议订货.
  it('says Today in a made item’s words', async () => {
    previews(() => HttpResponse.json(LOW));
    localStorage.setItem('language', 'zh-Hans');
    try {
      open({
        kind: 'edit',
        item: D3,
        point: { ...DETAIL.point, source: 'made' },
      });

      expect(
        await screen.findByText(
          '目前低于 2,000，因此建议生产 2,000，即 2 个 1,000。',
        ),
      ).toBeInTheDocument();
      // The bars say they show the position, not stock on hand.
      expect(screen.getByText('现在的预计可用')).toBeInTheDocument();
      expect(screen.getByText('按建议生产后的预计可用')).toBeInTheDocument();
    } finally {
      localStorage.removeItem('language');
    }
  });

  // Chosen as every card choice is (ADR-055): two pixels of the accent.
  it('draws the chosen rule as a chosen card', async () => {
    previews(() => HttpResponse.json(LOW));
    open({ kind: 'edit', item: D3, point: DETAIL.point });

    const card = (name: RegExp) =>
      screen.getByRole('radio', { name }).closest('.MuiPaper-root');
    expect(card(/^A fixed quantity/)).toHaveStyle({ borderWidth: '2px' });
    expect(card(/^Just enough/)).toHaveStyle({ borderWidth: '1px' });
  });

  it('drops an answer that comes after a newer one', async () => {
    previews(async (query) => {
      if (query.get('reorderPoint') === '200') {
        await delay(700);
        return HttpResponse.json({ ...LOW, suggestion: '9999.0000' });
      }
      return HttpResponse.json({ ...LOW, suggestedMultiples: null });
    });
    open({
      kind: 'edit',
      item: D3,
      point: { ...DETAIL.point, rule: 'just_enough', fixedQuantity: null },
    });

    await userEvent.clear(pointField());
    await userEvent.type(pointField(), '200');
    // Asked, and still waiting, when the point is typed on.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await userEvent.type(pointField(), '0');

    expect(
      await screen.findByText('Below 2,000 now, so it would suggest 2,000.'),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(screen.queryByText(/9,999/)).not.toBeInTheDocument();
  });

  it('says a point not above zero at its field, and asks nothing until it is', async () => {
    const asked = previews(() => HttpResponse.json(LOW));
    open({ kind: 'edit', item: D3, point: DETAIL.point });
    await waitFor(() => expect(asked).toHaveLength(1));

    await userEvent.clear(pointField());
    await userEvent.type(pointField(), '0');

    expect(
      await screen.findByText('Type a number above zero.'),
    ).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(asked).toHaveLength(1);
  });

  // A number above zero with a fifth place is told what to do about it.
  it('says a point past four decimal places is that, not below zero', async () => {
    previews(() => HttpResponse.json(LOW));
    open({ kind: 'edit', item: D3, point: DETAIL.point });

    await userEvent.clear(pointField());
    await userEvent.type(pointField(), '1.23456');

    expect(
      await screen.findByText('Type a number with up to 4 decimal places.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Type a number above zero.'),
    ).not.toBeInTheDocument();
  });

  it('marks a maximum at or below the point at its field, from the preview', async () => {
    previews(() =>
      apiError(
        400,
        'The maximum must be above the reorder point, 2000.',
        'reorder_maximum_not_above_point',
      ),
    );
    open({ kind: 'edit', item: D3, point: DETAIL.point });

    await userEvent.click(
      screen.getByRole('radio', { name: /Up to a maximum/ }),
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /Maximum/ }),
      '1500',
    );

    const maximum = screen.getByRole('textbox', { name: /Maximum/ });
    await waitFor(() =>
      expect(maximum).toHaveAccessibleDescription(
        'The maximum must be above the reorder point, 2000.',
      ),
    );
    expect(maximum).toBeInvalid();
  });

  it('clears a refusal from Save once the field changes', async () => {
    previews(() => HttpResponse.json(LOW));
    server.use(
      http.put('/api/v1/stock/reorder-points/:variantId', () =>
        apiError(
          400,
          'The maximum must be above the reorder point, 2000.',
          'reorder_maximum_not_above_point',
        ),
      ),
    );
    open({ kind: 'edit', item: D3, point: DETAIL.point });
    await userEvent.click(
      screen.getByRole('radio', { name: /Up to a maximum/ }),
    );
    const maximum = screen.getByRole('textbox', { name: /Maximum/ });
    await userEvent.type(maximum, '1500');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(maximum).toHaveAccessibleDescription(
        'The maximum must be above the reorder point, 2000.',
      ),
    );

    await userEvent.clear(maximum);
    await userEvent.type(maximum, '2500');

    await waitFor(() => expect(maximum).not.toBeInvalid());
    expect(
      screen.queryByText('The maximum must be above the reorder point, 2000.'),
    ).not.toBeInTheDocument();
  });

  it('opens from the Stock row as Edit when the item has a point', async () => {
    previews(() => HttpResponse.json(LOW));
    server.use(
      http.get('/api/v1/stock/reorder-points/:variantId', () =>
        HttpResponse.json(DETAIL),
      ),
    );
    open({ kind: 'find', item: D3 });

    expect(
      await screen.findByRole('heading', { name: 'Edit reorder point' }),
    ).toBeInTheDocument();
    expect(pointField()).toHaveValue('2000');
    expect(
      screen.getByRole('radio', { name: /A fixed quantity/ }),
    ).toBeChecked();
    expect(screen.getByRole('textbox', { name: /Quantity/ })).toHaveValue(
      '1000',
    );
    expect(
      screen.getByRole('button', { name: 'Remove reorder point' }),
    ).toBeInTheDocument();
  });

  it('opens from the Stock row as Add when it has none, made when it has an active recipe', async () => {
    server.use(
      http.get('/api/v1/stock/reorder-points/:variantId', () =>
        apiError(404, 'That item has no reorder point'),
      ),
      http.get('/api/v1/boms', () =>
        HttpResponse.json([{ id: 'bom-1', status: 'active' }]),
      ),
    );
    open({ kind: 'find', item: D3 });

    expect(
      await screen.findByRole('heading', { name: 'Add reorder point' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'Made', pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Remove reorder point' }),
    ).not.toBeInTheDocument();
  });

  it('offers to edit the point an item already has, from the server’s 409', async () => {
    previews(() => HttpResponse.json(LOW));
    server.use(
      http.post('/api/v1/stock/reorder-points/:variantId', () =>
        apiError(
          409,
          'PLAIN-1 already has a reorder point. Change it instead.',
          'reorder_point_exists',
        ),
      ),
      http.get('/api/v1/stock/reorder-points/:variantId', () =>
        HttpResponse.json(DETAIL),
      ),
    );
    const { onSaved } = open({ kind: 'add' });
    const picker = screen.getByRole('combobox', { name: /Item/ });
    // Add starts in its first field (WCAG 2.4.3).
    await waitFor(() => expect(picker).toHaveFocus());

    await userEvent.click(picker);
    await userEvent.click(
      await screen.findByRole('option', { name: /PLAIN-1/ }),
    );
    await userEvent.type(pointField(), '50');
    await userEvent.click(
      screen.getByRole('button', { name: 'Add reorder point' }),
    );

    expect(
      await screen.findByText(/PLAIN-1 already has a reorder point/),
    ).toBeInTheDocument();
    // Said once, with Edit it: not the server's "Change it instead" too.
    expect(screen.queryByText(/Change it instead/)).not.toBeInTheDocument();
    // Said at the picker, read with it, and focus taken there.
    expect(picker).toHaveAttribute('aria-invalid', 'true');
    expect(picker).toHaveAccessibleDescription(
      /PLAIN-1 already has a reorder point/,
    );
    await waitFor(() => expect(picker).toHaveFocus());
    await userEvent.click(screen.getByRole('button', { name: 'Edit it' }));

    expect(
      await screen.findByRole('heading', { name: 'Edit reorder point' }),
    ).toBeInTheDocument();
    expect(pointField()).toHaveValue('2000');
    await waitFor(() => expect(pointField()).toHaveFocus());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('asks before removing, and removes', async () => {
    previews(() => HttpResponse.json(LOW));
    const removed = vi.fn();
    server.use(
      http.delete('/api/v1/stock/reorder-points/:variantId', ({ params }) => {
        removed(params.variantId);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onSaved } = open({ kind: 'edit', item: D3, point: DETAIL.point });

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove reorder point' }),
    );
    const asking = await screen.findByRole('dialog', {
      name: 'Remove D3-1000’s reorder point?',
    });
    expect(
      within(asking).getByText(
        'It will no longer show as low, on Home or in the bell. Its stock and its orders do not change.',
      ),
    ).toBeInTheDocument();
    expect(removed).not.toHaveBeenCalled();

    await userEvent.click(
      within(asking).getByRole('button', { name: 'Remove reorder point' }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(removed).toHaveBeenCalledWith('variant-d3');
  });
});
