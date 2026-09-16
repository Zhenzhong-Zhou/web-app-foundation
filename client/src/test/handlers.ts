import { http, HttpResponse } from 'msw';

/**
 * The API as the server actually behaves, not as a component wishes it would.
 *
 * The risk with mocking is a mock that agrees with the client's assumptions —
 * which is why e2e exists and why nothing here is mocked there. What these
 * handlers are for is the other half: making a 409 or an empty catalogue cheap
 * to produce, when doing it for real means seeding a shelf and overselling it.
 *
 * Shapes are copied from the server DTOs. When one drifts, e2e is what catches
 * it; these tests would keep passing, which is the known cost of this layer.
 */

const BASE = '/api/v1';

export const VARIANTS = [
  {
    id: 'variant-plain',
    sku: 'PLAIN-1',
    variantName: null,
    productName: 'Plain Widget',
    type: 'good',
    unitOfMeasure: 'each',
    tracksLots: false,
  },
  {
    id: 'variant-lotted',
    sku: 'LOTTED-1',
    variantName: '60ct',
    productName: 'Tracked Supplement',
    type: 'good',
    unitOfMeasure: 'each',
    tracksLots: true,
  },
];

export const LOCATIONS = [
  {
    id: 'location-a',
    type: 'site',
    name: 'Main Site',
    code: 'MAIN',
    parentId: null,
    isAvailable: true,
    isActive: true,
  },
];

export const handlers = [
  http.get(`${BASE}/products/variants`, () => HttpResponse.json(VARIANTS)),
  http.get(`${BASE}/locations`, () => HttpResponse.json(LOCATIONS)),
  http.get(`${BASE}/stock`, () => HttpResponse.json([])),
  http.post(`${BASE}/stock/movements`, () =>
    HttpResponse.json({ movement: { id: 'movement-1' } }, { status: 201 }),
  ),
  http.get('/api/v1/stock/lots', () => HttpResponse.json([])),
  http.get(`${BASE}/boms`, () => HttpResponse.json([])),
  http.post(`${BASE}/boms`, () =>
    HttpResponse.json({ bom: { id: 'bom-1' } }, { status: 201 }),
  ),
];

/**
 * The shape AllExceptionsFilter returns. Tests override a handler with this
 * rather than constructing a bare status, because `api()` reads `message` out
 * of the body and a response without one surfaces as "Request failed (409)" —
 * which would make a test pass while the real message never rendered.
 */
export function apiError(status: number, message: string) {
  return HttpResponse.json(
    { statusCode: status, message, requestId: 'test-request' },
    { status },
  );
}
