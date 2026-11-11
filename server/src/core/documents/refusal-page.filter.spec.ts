import { type ArgumentsHost, ConflictException } from '@nestjs/common';

import { RefusalPageFilter } from './refusal-page.filter';

/** A host around a request that is a page visit, and its response. */
function hostFor(headersSent: boolean) {
  const res = {
    headersSent,
    status: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  const req = {
    headers: { 'sec-fetch-mode': 'navigate' },
    query: {},
    params: { id: 'order-1' },
    originalUrl: '/v1/orders/order-1/pdf',
    method: 'GET',
  };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  return { host, res };
}

describe('RefusalPageFilter', () => {
  it('answers a page visit with the page', () => {
    const { host, res } = hostFor(false);

    new RefusalPageFilter('/orders/:id').catch(
      new ConflictException('Refused.'),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.send).toHaveBeenCalledWith(
      expect.stringContaining('<p class="message">Refused.</p>'),
    );
    expect(res.json).not.toHaveBeenCalled();
  });

  // The PDF already on its way: no page in its place, as the global
  // filter leaves it.
  it('leaves a response already started as the global filter would', () => {
    const { host, res } = hostFor(true);

    new RefusalPageFilter('/orders/:id').catch(
      new ConflictException('Refused.'),
      host,
    );

    expect(res.send).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 409, message: 'Refused.' }),
    );
  });
});
