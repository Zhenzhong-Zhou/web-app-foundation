import type { INestApplication } from '@nestjs/common';
import fc from 'fast-check';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { each, expectCostToFollow, millionths } from './utils/cost-follows';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import {
  buy,
  cad,
  expectBooksToReconcile,
  move,
  valuationOf,
} from './utils/valuation';

/**
 * A late cost over generated orders of events (ADR-094's amendment, R2;
 * E5a): two bugs in a row, review 76's and #678, came from examples chosen
 * by hand. Each run is a new code, tracked by lot, and an order of up to ten
 * events among three lots: receipts with a price and without, shipments by
 * hand, sales shipped and then returned on their order or voided, and moves
 * to another lot; somewhere among them, one receipt with no price. That
 * receipt is then given its cost, and the three checks hold.
 *
 * A fixed seed and 50 runs in verify and CI. The weekly flake hunt gives a
 * new seed by COST_FOLLOWS_SEED and more runs by COST_FOLLOWS_RUNS, and puts
 * the seed in its summary; a failure names it too, so COST_FOLLOWS_SEED=<seed>
 * runs the same cases again here.
 */
const SEED = seedOf(process.env.COST_FOLLOWS_SEED);
const RUNS = runsOf(process.env.COST_FOLLOWS_RUNS);

function seedOf(given: string | undefined): number {
  if (!given) return 678;
  const seed = Number(given);
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`COST_FOLLOWS_SEED is ${given}: a whole number`);
  }
  return seed;
}

function runsOf(given: string | undefined): number {
  if (!given) return 50;
  const runs = Number(given);
  if (!Number.isSafeInteger(runs) || runs < 1) {
    throw new Error(`COST_FOLLOWS_RUNS is ${given}: a whole number above 0`);
  }
  return runs;
}

type Code = 'A' | 'B' | 'C';

const CODES: Code[] = ['A', 'B', 'C'];

/**
 * One event before the cost. A receipt names its lot; what takes stock out
 * names one of the lots holding any, by its place among them, so few events
 * fall on an empty lot, and a move names one of the other two lots.
 */
type Step =
  | { do: 'receive'; lot: Code; quantity: number; priced: boolean }
  | { do: 'ship'; lot: number; quantity: number }
  | { do: 'sell'; lot: number; quantity: number }
  | { do: 'return'; sale: number; quantity: number }
  | { do: 'void'; sale: number }
  | { do: 'move'; from: number; to: number; quantity: number };

interface Scenario {
  steps: Step[];
  /** The receipt with no price that is costed late, and where it comes. */
  costed: { at: number; lot: Code; quantity: number };
  /**
   * The one unit price of the run, for every receipt priced and for the
   * cost given late, so a share counted twice shows as a lot over it.
   */
  price: string;
}

const code = fc.constantFrom(...CODES);
const quantity = fc.integer({ min: 1, max: 12 });
const price = fc.constantFrom('1.00', '2.00', '3.00');

const step: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 2,
    arbitrary: fc.record({
      do: fc.constant('receive' as const),
      lot: code,
      quantity,
      priced: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      do: fc.constant('ship' as const),
      lot: fc.nat(2),
      quantity,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      do: fc.constant('sell' as const),
      lot: fc.nat(2),
      quantity,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      do: fc.constant('return' as const),
      sale: fc.nat(3),
      quantity,
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ do: fc.constant('void' as const), sale: fc.nat(3) }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      do: fc.constant('move' as const),
      from: fc.nat(2),
      to: fc.nat(1),
      quantity,
    }),
  },
);

const scenario: fc.Arbitrary<Scenario> = fc.record({
  steps: fc.array(step, { maxLength: 12 }),
  costed: fc.record({ at: fc.nat(12), lot: code, quantity }),
  price,
});

/** Millionths as the ledger's decimal string, six places. */
function decimal(units: bigint): string {
  const sign = units < 0n ? '-' : '';
  const size = units < 0n ? -units : units;
  const fraction = (size % 1_000_000n).toString().padStart(6, '0');
  return `${sign}${size / 1_000_000n}.${fraction}`;
}

describe('A late cost over generated orders (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  afterEach(async () => {
    await expectBooksToReconcile(db);
  });

  it(
    'holds the three checks after a receipt is costed late, over generated receipts, shipments, sales returned or voided, and moves between three lots',
    { timeout: RUNS * 4_000 },
    async () => {
      const { agent } = await registerOrganization(app, 'alpha');
      await agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'CAD' })
        .expect(204);
      const shelf = await createLocation(agent, {
        type: 'site',
        name: 'Shelf',
        code: 'SHELF',
      });
      const supplier = await createPartner(agent, {
        name: 'Cascade Botanicals',
        code: 'CASC',
      });
      const customer = await createPartner(agent, {
        name: 'Northside Pharmacy',
        code: 'NORTH',
      });
      const s = { agent, supplier, shelf };
      let codes = 0;

      /** One scenario, on a code of its own: its events, then the cost. */
      async function run({ steps, costed, price: late }: Scenario) {
        codes += 1;
        const variantId = await createVariant(agent, {
          type: 'good',
          name: `Generated ${codes}`,
          variant: { sku: `GEN-${codes}`, tracksLots: true },
        });
        const lotIds = new Map<Code, string>();
        const onHand = new Map<Code, number>();
        const sales: {
          orderId: string;
          lineId: string;
          shipmentId: string;
          lot: Code;
          shipped: number;
          returned: number;
          voided: boolean;
        }[] = [];
        let receiptRow = '';

        const held = (lot: Code) => onHand.get(lot) ?? 0;
        const add = (lot: Code, change: number) =>
          onHand.set(lot, held(lot) + change);
        /** The lot at this place among those holding stock, if any does. */
        const stocked = (place: number): Code | undefined => {
          const holding = CODES.filter((lot) => held(lot) > 0);
          return holding[place % Math.max(holding.length, 1)];
        };

        /** Into the lot by its code, made the first time; priced or not. */
        async function receive(lot: Code, units: number, unitPrice?: string) {
          const movementId = unitPrice
            ? await buy(s, variantId, String(units), cad(unitPrice), {
                code: lot,
              })
            : await move(s, {
                variantId,
                toLocationId: shelf,
                quantity: String(units),
                reason: 'receipt',
                lot: { code: lot },
              });
          const row = await valuationOf(db, movementId);
          lotIds.set(lot, row.lotId!);
          add(lot, units);
          return row.id;
        }

        const events: (Step | { do: 'costed' })[] = [...steps];
        events.splice(costed.at % (steps.length + 1), 0, { do: 'costed' });

        for (const event of events) {
          switch (event.do) {
            case 'costed': {
              receiptRow = await receive(costed.lot, costed.quantity);
              break;
            }
            case 'receive': {
              await receive(
                event.lot,
                event.quantity,
                event.priced ? late : undefined,
              );
              break;
            }
            case 'ship': {
              const lot = stocked(event.lot);
              if (!lot) break;
              const units = Math.min(event.quantity, held(lot));
              await move(s, {
                variantId,
                lotId: lotIds.get(lot),
                fromLocationId: shelf,
                quantity: String(units),
                reason: 'shipment',
              });
              add(lot, -units);
              break;
            }
            case 'sell': {
              const lot = stocked(event.lot);
              if (!lot) break;
              const units = Math.min(event.quantity, held(lot));
              const order = body<{
                order: { id: string; lines: { id: string }[] };
              }>(
                await agent
                  .post('/v1/orders')
                  .send({
                    partnerId: customer,
                    direction: 'sale',
                    lines: [
                      {
                        variantId,
                        quantityOrdered: String(units),
                        ...cad('10'),
                      },
                    ],
                  })
                  .expect(201),
              ).order;
              await agent
                .patch(`/v1/orders/${order.id}`)
                .send({ status: 'confirmed' })
                .expect(204);
              const shipment = body<{ shipment: { id: string } }>(
                await agent
                  .post(`/v1/orders/${order.id}/shipments`)
                  .send({
                    fromLocationId: shelf,
                    lines: [
                      {
                        lineId: order.lines[0].id,
                        quantity: String(units),
                        lots: [
                          {
                            lotId: lotIds.get(lot),
                            quantity: String(units),
                          },
                        ],
                      },
                    ],
                  })
                  .expect(201),
              ).shipment;
              sales.push({
                orderId: order.id,
                lineId: order.lines[0].id,
                shipmentId: shipment.id,
                lot,
                shipped: units,
                returned: 0,
                voided: false,
              });
              add(lot, -units);
              break;
            }
            case 'return': {
              const sale = sales[event.sale % Math.max(sales.length, 1)];
              if (!sale || sale.voided) break;
              const units = Math.min(
                event.quantity,
                sale.shipped - sale.returned,
              );
              if (units === 0) break;
              await agent
                .post(`/v1/orders/${sale.orderId}/returns`)
                .send({
                  toLocationId: shelf,
                  reason: 'Damaged in transit',
                  lines: [
                    {
                      lineId: sale.lineId,
                      lots: [
                        {
                          lotId: lotIds.get(sale.lot),
                          quantity: String(units),
                        },
                      ],
                    },
                  ],
                })
                .expect(201);
              sale.returned += units;
              add(sale.lot, units);
              break;
            }
            case 'void': {
              const sale = sales[event.sale % Math.max(sales.length, 1)];
              // A shipment part returned did leave, so it is not voided.
              if (!sale || sale.voided || sale.returned > 0) break;
              await agent
                .post(
                  `/v1/orders/${sale.orderId}/shipments/${sale.shipmentId}/void`,
                )
                .send({ reason: 'Recorded before the box left' })
                .expect(204);
              // Reopened, the order would hold the stock back; dropped, as
              // the sale never happened.
              await agent
                .patch(`/v1/orders/${sale.orderId}`)
                .send({ status: 'cancelled' })
                .expect(204);
              sale.voided = true;
              add(sale.lot, sale.shipped);
              break;
            }
            case 'move': {
              const from = stocked(event.from);
              if (!from) break;
              const into = CODES.filter((lot) => lot !== from)[event.to % 2];
              const units = Math.min(event.quantity, held(from));
              const to = lotIds.get(into);
              const res = await agent
                .post(`/v1/stock/lots/${lotIds.get(from)}/lot-changes`)
                .send({
                  locationId: shelf,
                  quantity: String(units),
                  note: 'Two runs in one delivery',
                  ...(to ? { toLotId: to } : { lot: { code: into } }),
                })
                .expect(201);
              lotIds.set(into, body<{ toLot: { id: string } }>(res).toLot.id);
              add(from, -units);
              add(into, units);
              break;
            }
          }
        }

        const { cost } = body<{
          cost: {
            value: string;
            held: string;
            issued: string;
            followed: { value: string }[];
          };
        }>(
          await agent
            .put(`/v1/costs/valuations/${receiptRow}`)
            .send(cad(late))
            .expect(200),
        );
        const change = decimal(BigInt(costed.quantity) * millionths(late));
        expect(cost.value).toBe(change);

        await expectCostToFollow(db, {
          variantId,
          change,
          most: each(late),
          answer: cost,
        });
      }

      await fc.assert(fc.asyncProperty(scenario, run), {
        seed: SEED,
        numRuns: RUNS,
      });
    },
  );
});
