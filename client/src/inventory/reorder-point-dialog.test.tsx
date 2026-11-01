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
  drafts: [],
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

    await userEvent.click(screen.getByRole('combobox', { name: /Item/ }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Edit it' }));

    expect(
      await screen.findByRole('heading', { name: 'Edit reorder point' }),
    ).toBeInTheDocument();
    expect(pointField()).toHaveValue('2000');
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
