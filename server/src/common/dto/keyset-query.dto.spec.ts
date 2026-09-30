import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import { ListNotificationsDto } from '../../core/notifications/dto/list-notifications.dto';
import { ListOrdersDto } from '../../modules/orders/dto/list-orders.dto';

/**
 * Tested through the lists that extend it, because inheriting the rules is
 * the point: a subclass that lost them would take ?limit=999999 quietly.
 */
describe.each([
  ['ListNotificationsDto', ListNotificationsDto],
  ['ListOrdersDto', ListOrdersDto],
])('%s paging', (_name, Dto) => {
  const failures = (query: Record<string, string>) =>
    validateSync(plainToInstance(Dto, query) as object).map(
      (error) => error.property,
    );

  it('takes a limit up to 100, as a number', () => {
    expect(failures({ limit: '100' })).toEqual([]);
    expect(plainToInstance(Dto, { limit: '100' }).limit).toBe(100);
  });

  it('refuses a limit past the cap, or below one', () => {
    expect(failures({ limit: '101' })).toEqual(['limit']);
    expect(failures({ limit: '0' })).toEqual(['limit']);
  });

  it('takes only a UUID as the cursor', () => {
    expect(
      failures({ before: '01a0efe8-6459-77a7-a4df-87ba5924f53c' }),
    ).toEqual([]);
    expect(failures({ before: 'page-2' })).toEqual(['before']);
  });
});
