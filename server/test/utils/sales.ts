import { body, createLocation, createPartner, createVariant } from './fixtures';
import type { authedAgent } from './request';

type Agent = ReturnType<typeof authedAgent>;

/**
 * The sale the invoicing specs start from: two untracked items on one
 * stocked shelf, a confirmed sale of 10 capsules and 5 scoops priced in CAD,
 * and one shipment carrying 6 capsules and all 5 scoops. Invoices, RMAs and
 * credit notes each open with this; what they do with it is theirs.
 *
 * A sample carries no prices. `partnerId` is for a spec that has set its
 * partner up already (credit notes give it a billing address before the
 * sale); without it the usual customer is created. `names` are the product
 * names, which show on invoice lines, so the invoices spec keeps its own.
 */
export async function shippedSale(
  agent: Agent,
  options: {
    isSample?: boolean;
    partnerId?: string;
    names?: { capsules: string; scoop: string };
  } = {},
) {
  const partnerId =
    options.partnerId ??
    (await createPartner(agent, { name: 'Northside Pharmacy', code: 'NORTH' }));

  const shelf = await createLocation(agent, { type: 'site', name: 'Shelf' });

  const names = options.names ?? { capsules: 'FOCUS-60CT', scoop: 'SCOOP' };
  const capsules = await createVariant(agent, {
    type: 'good',
    name: names.capsules,
    variant: { sku: 'FOCUS-60CT' },
  });
  const scoop = await createVariant(agent, {
    type: 'good',
    name: names.scoop,
    variant: { sku: 'SCOOP' },
  });

  for (const variantId of [capsules, scoop]) {
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId,
        toLocationId: shelf,
        quantity: '100',
        reason: 'receipt',
      })
      .expect(201);
  }

  const price = options.isSample ? {} : { unitPrice: '12.5', currency: 'CAD' };

  const order = body<{
    order: { id: string; lines: { id: string; variantId: string }[] };
  }>(
    await agent
      .post('/v1/orders')
      .send({
        partnerId,
        direction: 'sale',
        isSample: options.isSample ?? false,
        lines: [
          { variantId: capsules, quantityOrdered: '10', ...price },
          { variantId: scoop, quantityOrdered: '5', ...price },
        ],
      })
      .expect(201),
  ).order;

  await agent
    .patch(`/v1/orders/${order.id}`)
    .send({ status: 'confirmed' })
    .expect(204);

  const lineOf = (variantId: string) =>
    order.lines.find((line) => line.variantId === variantId)!.id;

  const shipment = body<{ shipment: { id: string } }>(
    await agent
      .post(`/v1/orders/${order.id}/shipments`)
      .send({
        fromLocationId: shelf,
        lines: [
          { lineId: lineOf(capsules), quantity: '6' },
          { lineId: lineOf(scoop), quantity: '5' },
        ],
      })
      .expect(201),
  ).shipment;

  return {
    partnerId,
    shelf,
    orderId: order.id,
    shipmentId: shipment.id,
    capsulesLine: lineOf(capsules),
    scoopLine: lineOf(scoop),
  };
}
