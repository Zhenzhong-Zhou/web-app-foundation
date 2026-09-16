import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import type { Variant } from '../products/products-page';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { RecipePanel } from './recipe-panel';

/**
 * What e2e cannot reach cheaply: the branches that depend on status.
 *
 * The browser suite proves a recipe can be written and promoted once.
 * Everything else here — which buttons an active recipe offers, what a cycle
 * looks like when the server refuses it, an empty panel — costs a registration
 * and a browser there and milliseconds here.
 *
 * getByRole throughout, never getByLabelText: MUI links a TextField label by
 * aria-labelledby rather than rendering a real <label>.
 *
 * renderWithAuth supplies the permissions the panel reads. They decide which
 * controls exist, so every spec has to say which it is granting.
 */

const ALL = ['boms.view', 'boms.create', 'boms.update'];

const VARIANTS: Variant[] = [
  {
    id: 'variant-output',
    sku: 'D3-60CT',
    name: '60ct',
    unitOfMeasure: 'each',
    tracksLots: true,
    isActive: true,
  } as Variant,
];

const DRAFT = {
  id: 'bom-draft',
  outputVariantId: 'variant-output',
  outputQuantity: '1000.0000',
  version: 2,
  status: 'draft',
  licenceId: null,
  notes: null,
};

const ACTIVE = { ...DRAFT, id: 'bom-active', version: 1, status: 'active' };

const BLEND_LINE = {
  id: 'line-blend',
  componentVariantId: 'variant-plain',
  quantity: '2400.0000',
  supplyType: 'stocked',
  notes: null,
};

const BOTTLE_LINE = {
  id: 'line-bottle',
  componentVariantId: 'variant-lotted',
  quantity: '1000.0000',
  supplyType: 'external',
  notes: null,
};

function serveRecipe(
  versions: unknown[],
  detail: Record<string, unknown> | null,
) {
  server.use(
    http.get('/api/v1/boms', () => HttpResponse.json(versions)),
    ...(detail
      ? [http.get('/api/v1/boms/:id', () => HttpResponse.json(detail))]
      : []),
  );
}

describe('RecipePanel', () => {
  it('invites a first recipe when the variant has none', async () => {
    serveRecipe([], null);

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    expect(await screen.findByText(/No recipe yet/)).toBeInTheDocument();
  });

  it('shows components with their SKU and unit rather than raw ids', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE] });

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    // PLAIN-1 and 'each' both come from the catalogue handler, not the line.
    expect(await screen.findByText('PLAIN-1')).toBeInTheDocument();
    expect(screen.getByText(/2400.0000 each/)).toBeInTheDocument();
  });

  it('marks a component the manufacturer provides', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE, BOTTLE_LINE] });

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    expect(await screen.findByText('Manufacturer')).toBeInTheDocument();
    expect(screen.getByText('Us')).toBeInTheDocument();
  });

  /**
   * The rule that shapes the whole panel: an active recipe is not editable, so
   * it offers a new version instead of an Add component that would 409.
   */
  it('offers a new version for an active recipe, not editing', async () => {
    serveRecipe([ACTIVE], { ...ACTIVE, lines: [BLEND_LINE] });

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    expect(
      await screen.findByRole('button', { name: 'New version' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add component' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Promote' }),
    ).not.toBeInTheDocument();
  });

  it('will not promote a draft with no components', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [] });

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    expect(
      await screen.findByRole('button', { name: 'Promote' }),
    ).toBeDisabled();
    expect(
      screen.getByText(/cannot be promoted — it would make stock appear/),
    ).toBeInTheDocument();
  });

  it('enables promotion once a component exists', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE] });

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Promote' })).toBeEnabled(),
    );
  });

  /**
   * A cycle reachable only through another recipe cannot be detected in the
   * browser, so the 409 has to render rather than being swallowed.
   */
  it('renders a refusal from the server', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE] });
    server.use(
      http.post('/api/v1/boms/:id/promote', () =>
        apiError(409, 'A BOM with no lines cannot be promoted'),
      ),
    );

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    await userEvent.click(
      await screen.findByRole('button', { name: 'Promote' }),
    );

    expect(
      await screen.findByText('A BOM with no lines cannot be promoted'),
    ).toBeInTheDocument();
  });

  /**
   * The panel renders nothing at all without boms.view, rather than an empty
   * section: a heading over a permanently blank table reads as broken.
   */
  it('renders nothing for someone who cannot see recipes', () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE] });

    const { container } = renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ['products.view'],
    });

    expect(container).toBeEmptyDOMElement();
  });

  it('hides every write control from a read-only viewer', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE] });

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ['boms.view'],
    });

    expect(await screen.findByText('PLAIN-1')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'New recipe' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Promote' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add component' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the catalogue failure out of the recipe error banner', async () => {
    serveRecipe([DRAFT], { ...DRAFT, lines: [BLEND_LINE] });
    server.use(
      http.get('/api/v1/products/variants', () =>
        apiError(500, 'Catalogue unavailable'),
      ),
    );

    renderWithAuth(<RecipePanel variants={VARIANTS} />, {
      permissions: ALL,
    });

    // The line still renders, labelled by id, and no alert appears: a missing
    // label is not a reason to tell someone their recipe failed to load.
    expect(await screen.findByText('variant-plain')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
