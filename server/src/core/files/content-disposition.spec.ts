import { dispositionOf } from './content-disposition';

describe('dispositionOf', () => {
  it('writes / as _ in a file name', () => {
    expect(dispositionOf('attachment', 'INV/2026/00452.pdf')).toBe(
      `attachment; filename="INV_2026_00452.pdf"; filename*=UTF-8''INV_2026_00452.pdf`,
    );
  });
});
