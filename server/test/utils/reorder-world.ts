import { body, createLocation, createPartner, createVariant } from './fixtures';
import type { authedAgent } from './request';

type Agent = ReturnType<typeof authedAgent>;

/**
 * What a reorder point's position is made of (ADR-085), through the API,
 * as a person would make it: stock where it can and cannot be used,
 * orders confirmed, received, shipped or closed short, runs released and
 * producing, and drafts. Each returns what the next step needs.
 */

/** A good, untracked unless asked, named by its SKU. */
export function item(agent: Agent, sku: string, tracksLots = false) {
  return createVariant(agent, {
    type: 'good',
    name: sku,
    variant: { sku, unitOfMeasure: 'each', tracksLots },
  });
}

/** A site holding stock, marked unavailable when asked (ADR-042). */
export async function site(agent: Agent, name: string, available = true) {
  const id = await createLocation(agent, { type: 'site', name, code: name });
  if (!available) {
    await agent
      .patch(`/v1/locations/${id}`)
      .send({ isAvailable: false })
      .expect(204);
  }
  return id;
}

/** Stock received by hand, into a lot when one is given. */
export async function receive(
  agent: Agent,
  variantId: string,
  toLocationId: string,
  quantity: string,
  lot?: { code: string; expiresAt?: string },
) {
  await agent
    .post('/v1/stock/movements')
    .send({ variantId, toLocationId, quantity, reason: 'receipt', lot })
    .expect(201);
}

export interface Order {
  id: string;
  number: string;
  lineId: string;
}

/** A one-line order, confirmed unless left a draft. */
export async function order(
  agent: Agent,
  direction: 'purchase' | 'sale',
  partnerId: string,
  variantId: string,
  quantityOrdered: string,
  options: { draft?: boolean; expectedAt?: string } = {},
): Promise<Order> {
  const created = body<{
    order: { id: string; number: string; lines: { id: string }[] };
  }>(
    await agent
      .post('/v1/orders')
      .send({
        partnerId,
        direction,
        expectedAt: options.expectedAt,
        // A sale is confirmed only with a price; zero is one.
        lines: [
          { variantId, quantityOrdered, unitPrice: '0', currency: 'CAD' },
        ],
      })
      .expect(201),
  ).order;

  if (!options.draft) {
    await agent
      .patch(`/v1/orders/${created.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
  }

  return {
    id: created.id,
    number: created.number,
    lineId: created.lines[0].id,
  };
}

/** A partner, to buy from or sell to. */
export function partner(agent: Agent, name: string) {
  return createPartner(agent, { name });
}

/** Part of a purchase's line received. */
export async function receiveLine(
  agent: Agent,
  purchase: Order,
  toLocationId: string,
  quantity: string,
) {
  await agent
    .post(`/v1/orders/${purchase.id}/lines/${purchase.lineId}/receipts`)
    .send({ toLocationId, quantity })
    .expect(201);
}

/** Part of a sale's line shipped. */
export async function ship(
  agent: Agent,
  sale: Order,
  fromLocationId: string,
  quantity: string,
) {
  await agent
    .post(`/v1/orders/${sale.id}/shipments`)
    .send({ fromLocationId, lines: [{ lineId: sale.lineId, quantity }] })
    .expect(201);
}

/** No more is coming, or going, on this line (ADR-034). */
export async function closeShort(agent: Agent, line: Order) {
  await agent
    .post(`/v1/orders/${line.id}/lines/${line.lineId}/close`)
    .send({ reason: 'No more' })
    .expect(204);
}

/** An active recipe making one of `outputId` from `per` of `componentId`. */
export async function recipe(
  agent: Agent,
  outputId: string,
  componentId: string,
  per: string,
) {
  const bomId = body<{ bom: { id: string } }>(
    await agent
      .post('/v1/boms')
      .send({
        outputVariantId: outputId,
        outputQuantity: '1',
        lines: [{ componentVariantId: componentId, quantity: per }],
      })
      .expect(201),
  ).bom.id;
  await agent.post(`/v1/boms/${bomId}/promote`).expect(204);
  return bomId;
}

/**
 * A run of `outputId` by its recipe at a location, a draft unless
 * released, its components then issued from `sourceLocationId`.
 */
export async function run(
  agent: Agent,
  fields: {
    outputId: string;
    bomId: string;
    locationId: string;
    quantityPlanned: string;
    reference?: string;
  },
  sourceLocationId?: string,
): Promise<string> {
  const { id } = body<{ productionOrder: { id: string } }>(
    await agent
      .post('/v1/production-orders')
      .send({
        outputVariantId: fields.outputId,
        bomId: fields.bomId,
        locationId: fields.locationId,
        quantityPlanned: fields.quantityPlanned,
        reference: fields.reference,
      })
      .expect(201),
  ).productionOrder;

  if (sourceLocationId) {
    await agent
      .post(`/v1/production-orders/${id}/release`)
      .send({ sourceLocationId })
      .expect(200);
  }

  return id;
}

/** Output recorded on a released run of an untracked item. */
export async function output(agent: Agent, runId: string, quantity: string) {
  await agent
    .post(`/v1/production-orders/${runId}/output`)
    .send({ quantity })
    .expect(201);
}

/** An item's reorder point, just enough unless another rule is given. */
export async function point(
  agent: Agent,
  variantId: string,
  reorderPoint: string,
  rule: Record<string, unknown> = { rule: 'just_enough' },
  source: 'bought' | 'made' = 'bought',
) {
  await agent
    .post(`/v1/stock/reorder-points/${variantId}`)
    .send({ source, reorderPoint, ...rule })
    .expect(204);
}
