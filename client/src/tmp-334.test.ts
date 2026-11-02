import { expect, it } from 'vitest';

it('fails on purpose, for #334', () => {
  expect(1).toBe(2);
});
