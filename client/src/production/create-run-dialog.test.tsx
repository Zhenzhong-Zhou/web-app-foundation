import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { CreateRunDialog } from './create-run-dialog';

const VARIANT = {
  id: 'variant-focus',
  sku: 'FOCUS-60CT',
  variantName: null,
  productName: 'Focus',
  unitOfMeasure: 'each',
  tracksLots: true,
};

describe('CreateRunDialog', () => {
  /**
   * The select shows the active recipe as soon as an item is chosen. Sending
   * only a recipe somebody clicked planned the run with none — twice, once
   * as the original bug and once as a regression.
   */
  it('plans with the recipe the select is showing', async () => {
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];

    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () =>
        HttpResponse.json([
          { id: 'loc-wip', name: 'WIP', type: 'bin', parentId: null },
        ]),
      ),
      http.get('/api/v1/partners', () => HttpResponse.json([])),
      http.get('/api/v1/boms', () =>
        HttpResponse.json([
          {
            id: 'bom-active',
            outputVariantId: VARIANT.id,
            version: 1,
            status: 'active',
            outputQuantity: '1000.0000',
          },
        ]),
      ),
      http.post('/api/v1/production-orders', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { productionOrder: { id: 'run-1' } },
          { status: 201 },
        );
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await user.type(await screen.findByLabelText(/Making/), 'FOCUS');
    await user.click(await screen.findByRole('option', { name: /FOCUS-60CT/ }));
    await user.type(screen.getByLabelText(/Quantity to make/), '1000');
    await user.click(screen.getByLabelText(/Made at/));
    await user.click(await screen.findByRole('option', { name: /WIP/ }));
    expect(
      await screen.findByRole('combobox', { name: 'Recipe' }),
    ).toHaveTextContent('v1 (current)');

    await user.click(screen.getByRole('button', { name: 'Plan run' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].bomId).toBe('bom-active');
  });

  /**
   * The recipes come after the item is chosen. Plan run waits for them:
   * pressed before they came, the run went without its recipe (#290).
   */
  it('waits for the item’s recipes before Plan run, then plans with the active one', async () => {
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];
    let answerRecipes: () => void = () => undefined;
    const recipesAnswered = new Promise<void>((resolve) => {
      answerRecipes = resolve;
    });

    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () =>
        HttpResponse.json([
          { id: 'loc-wip', name: 'WIP', type: 'bin', parentId: null },
        ]),
      ),
      http.get('/api/v1/partners', () => HttpResponse.json([])),
      http.get('/api/v1/boms', async () => {
        await recipesAnswered;
        return HttpResponse.json([
          {
            id: 'bom-active',
            outputVariantId: VARIANT.id,
            version: 1,
            status: 'active',
            outputQuantity: '1000.0000',
          },
        ]);
      }),
      http.post('/api/v1/production-orders', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { productionOrder: { id: 'run-1' } },
          { status: 201 },
        );
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await user.type(await screen.findByLabelText(/Making/), 'FOCUS');
    await user.click(await screen.findByRole('option', { name: /FOCUS-60CT/ }));
    await user.type(screen.getByLabelText(/Quantity to make/), '1000');
    await user.click(screen.getByLabelText(/Made at/));
    await user.click(await screen.findByRole('option', { name: /WIP/ }));

    // Not yet: no recipe shown, and none said to be missing.
    const planRun = screen.getByRole('button', { name: 'Plan run' });
    expect(planRun).toBeDisabled();
    expect(
      screen.queryByRole('combobox', { name: 'Recipe' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/No promoted recipe/)).not.toBeInTheDocument();

    answerRecipes();

    expect(
      await screen.findByRole('combobox', { name: 'Recipe' }),
    ).toHaveTextContent('v1 (current)');
    expect(planRun).toBeEnabled();

    await user.click(planRun);

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].bomId).toBe('bom-active');
  });

  /**
   * A read of the recipes that fails says so, and Plan run stays off:
   * never a run planned without its recipe, silently (#290).
   */
  it('says the item’s recipes could not be loaded, and plans nothing', async () => {
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];

    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () =>
        HttpResponse.json([
          { id: 'loc-wip', name: 'WIP', type: 'bin', parentId: null },
        ]),
      ),
      http.get('/api/v1/partners', () => HttpResponse.json([])),
      http.get('/api/v1/boms', () => apiError(500, 'Something went wrong')),
      http.post('/api/v1/production-orders', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { productionOrder: { id: 'run-1' } },
          { status: 201 },
        );
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await user.type(await screen.findByLabelText(/Making/), 'FOCUS');
    await user.click(await screen.findByRole('option', { name: /FOCUS-60CT/ }));

    expect(
      await screen.findByRole('alert', { name: 'Error' }),
    ).toHaveTextContent('Could not load the item’s recipes.');
    // The read failed; that is not the item having no recipe.
    expect(screen.queryByText(/No promoted recipe/)).not.toBeInTheDocument();

    const quantity = screen.getByLabelText(/Quantity to make/);
    await user.type(quantity, '1000');
    await user.click(screen.getByLabelText(/Made at/));
    await user.click(await screen.findByRole('option', { name: /WIP/ }));

    const planRun = screen.getByRole('button', { name: 'Plan run' });
    expect(planRun).toBeDisabled();
    expect(planRun).toHaveAccessibleDescription(
      'Could not load the item’s recipes.',
    );

    // Enter in a field submits through Plan run, which is off.
    await user.type(quantity, '{Enter}');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sent).toHaveLength(0);
  });

  /**
   * Try again, beside the words, reads the item's recipes again: choosing
   * the same item again changes nothing, so it is the way on from a failed
   * read, and the run is then planned with the active recipe.
   */
  it('reads the item’s recipes again on Try again, then plans with the active one', async () => {
    const user = userEvent.setup();
    const sent: Record<string, unknown>[] = [];
    let reads = 0;

    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () =>
        HttpResponse.json([
          { id: 'loc-wip', name: 'WIP', type: 'bin', parentId: null },
        ]),
      ),
      http.get('/api/v1/partners', () => HttpResponse.json([])),
      http.get('/api/v1/boms', () => {
        reads += 1;
        return reads === 1
          ? apiError(500, 'Something went wrong')
          : HttpResponse.json([
              {
                id: 'bom-active',
                outputVariantId: VARIANT.id,
                version: 1,
                status: 'active',
                outputQuantity: '1000.0000',
              },
            ]);
      }),
      http.post('/api/v1/production-orders', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>);
        return HttpResponse.json(
          { productionOrder: { id: 'run-1' } },
          { status: 201 },
        );
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await user.type(await screen.findByLabelText(/Making/), 'FOCUS');
    await user.click(await screen.findByRole('option', { name: /FOCUS-60CT/ }));
    await user.type(screen.getByLabelText(/Quantity to make/), '1000');
    await user.click(screen.getByLabelText(/Made at/));
    await user.click(await screen.findByRole('option', { name: /WIP/ }));

    const failure = await screen.findByRole('alert', { name: 'Error' });
    expect(failure).toHaveTextContent('Could not load the item’s recipes.');

    await user.click(
      within(failure).getByRole('button', { name: 'Try again' }),
    );

    expect(
      await screen.findByRole('combobox', { name: 'Recipe' }),
    ).toHaveTextContent('v1 (current)');
    expect(
      screen.queryByText('Could not load the item’s recipes.'),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Plan run' }));

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].bomId).toBe('bom-active');
    expect(reads).toBe(2);
  });

  /**
   * Production may not see partners (ADR-080): the dialog does not ask,
   * so the item and the place still come, and the manufacturer's field
   * says why it offers only making it here.
   */
  it('plans without asking for partners the reader may not see', async () => {
    let askedForPartners = false;
    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () =>
        HttpResponse.json([
          { id: 'loc-wip', name: 'WIP', type: 'bin', parentId: null },
        ]),
      ),
      http.get('/api/v1/partners', () => {
        askedForPartners = true;
        return HttpResponse.json([]);
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners={false}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect(
      await screen.findByText(
        'You can’t see customers and suppliers, so a contract manufacturer can’t be chosen here.',
      ),
    ).toBeInTheDocument();
    // The empty choice named in words, as the field's value (#274).
    expect(
      screen.getByRole('combobox', { name: 'Contract manufacturer' }),
    ).toHaveValue('We make it ourselves');
    await userEvent.click(screen.getByLabelText(/Made at/));
    expect(
      await screen.findByRole('option', { name: 'WIP' }),
    ).toBeInTheDocument();
    expect(askedForPartners).toBe(false);
  });

  /**
   * Retired partners are left out, as on New order and a sample's Given
   * to (#304).
   */
  it('does not offer a retired partner as contract manufacturer', async () => {
    const user = userEvent.setup();
    const partner = {
      taxId: null,
      salePriceListId: null,
      purchasePriceListId: null,
      documentLanguage: null,
      documentSecondLanguage: null,
      notes: null,
    };
    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
      http.get('/api/v1/partners', () =>
        HttpResponse.json([
          {
            ...partner,
            id: 'partner-acme',
            name: 'Acme Labs',
            code: 'ACME',
            isActive: true,
          },
          {
            ...partner,
            id: 'partner-old',
            name: 'Old Labs',
            code: 'OLD',
            isActive: false,
          },
        ]),
      ),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    await user.click(
      screen.getByRole('combobox', { name: 'Contract manufacturer' }),
    );

    expect(
      await screen.findByRole('option', { name: 'Acme Labs (ACME)' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Old Labs/ }),
    ).not.toBeInTheDocument();
  });

  /**
   * A catalogue that failed to load says so, as Receive does, above the
   * picker and in its list, never as "No matching items" (#303).
   */
  it('says the catalogue could not be loaded, not that nothing matches', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/products/variants', () =>
        apiError(500, 'Something went wrong'),
      ),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners={false}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect(
      await screen.findByRole('alert', { name: 'Error' }),
    ).toHaveTextContent('Could not load the catalogue.');

    await user.click(screen.getByRole('combobox', { name: 'Making' }));

    expect(screen.getAllByText('Could not load the catalogue.')).toHaveLength(
      2,
    );
    expect(screen.queryByText('No matching items')).not.toBeInTheDocument();
  });

  /**
   * Plan a run on Reorder points (ADR-085): the item and the quantity
   * filled in with a note, the recipe following the item, and what the run
   * would use as the server scales it, asked once typing pauses, an answer
   * to an older quantity dropped.
   */
  it('opens filled in, and shows what the run would use for the quantity as it is', async () => {
    const user = userEvent.setup();
    const asked: string[] = [];

    server.use(
      http.get('/api/v1/products/variants', () => HttpResponse.json([VARIANT])),
      http.get('/api/v1/locations', () => HttpResponse.json([])),
      http.get('/api/v1/partners', () => HttpResponse.json([])),
      http.get('/api/v1/boms', () =>
        HttpResponse.json([
          {
            id: 'bom-active',
            outputVariantId: VARIANT.id,
            version: 2,
            status: 'active',
            outputQuantity: '12.0000',
          },
        ]),
      ),
      http.get('/api/v1/production-orders/preview', async ({ request }) => {
        const query = new URL(request.url).searchParams;
        const quantity = query.get('quantityPlanned')!;
        asked.push(`${query.get('bomId')} ${quantity}`);
        // The first answer arrives after the second is asked.
        if (quantity === '60') await delay(400);
        return HttpResponse.json({
          lines: [
            {
              componentVariantId: 'variant-bottle',
              sku: 'MAGCAP-60',
              productName: 'Magnesium',
              variantName: '60ct',
              unitOfMeasure: 'each',
              supplyType: 'stocked',
              quantity: quantity === '60' ? '5.0000' : '10.0000',
            },
          ],
        });
      }),
    );

    renderWithAuth(
      <CreateRunDialog
        open
        canSeePartners
        filled={{
          outputVariantId: VARIANT.id,
          quantityPlanned: '60',
          note: 'Filled from Reorder points: 60 brings it back to its reorder point, 100.',
        }}
        onClose={() => undefined}
        onCreated={() => undefined}
      />,
    );

    expect(
      screen.getByText(
        'Filled from Reorder points: 60 brings it back to its reorder point, 100.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantity to make/)).toHaveValue('60');
    expect(
      await screen.findByRole('combobox', { name: 'Recipe' }),
    ).toHaveTextContent('v2 (current) — makes 12');
    await expect.poll(() => asked).toEqual(['bom-active 60']);

    // Typed again before the first answer comes: one question, once paused.
    const quantity = screen.getByLabelText(/Quantity to make/);
    await user.clear(quantity);
    await user.type(quantity, '120');

    const uses = await screen.findByRole('region', { name: 'Uses' });
    await expect
      .poll(() => uses.textContent)
      .toContain('10 each · MAGCAP-60 Magnesium (60ct)');
    expect(asked).toEqual(['bom-active 60', 'bom-active 120']);

    // The first answer, arriving late, does not replace it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(uses.textContent).toContain('10 each');
    expect(uses.textContent).not.toContain('5 each');
  });
});
