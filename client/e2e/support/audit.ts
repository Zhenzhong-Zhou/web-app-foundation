import { type APIRequestContext, expect } from '@playwright/test';

/** Documents' series, each a change of its own in the Activity log. */
const SERIES = [
  'invoice',
  'creditNote',
  'returnAuthorization',
  'saleOrder',
  'purchaseOrder',
  'lot',
] as const;

/**
 * An Activity log entry with seven changes (ADR-076 amended; ADR-094
 * amended, R23): Documents' numbering saved with every series' digits and
 * the date order changed, so "Numbering changed" holds one change a
 * series and one for the order.
 */
export async function numberingChangedSevenWays(
  api: APIRequestContext,
): Promise<void> {
  const { numbering } = (await (
    await api.get('/v1/organization/numbering')
  ).json()) as {
    numbering: Record<
      (typeof SERIES)[number],
      { prefix: string; digits: number; reset: string }
    > & { documentsInDateOrder: boolean };
  };
  const saved = await api.put('/v1/organization/numbering', {
    data: {
      ...Object.fromEntries(
        SERIES.map((key) => {
          const { prefix, digits, reset } = numbering[key];
          return [key, { prefix, digits: digits + 1, reset }];
        }),
      ),
      documentsInDateOrder: !numbering.documentsInDateOrder,
    },
  });
  expect(saved.ok(), await saved.text()).toBeTruthy();
}
