import { describe, expect, it } from 'vitest';

import { FRAME_WIDTH, frameWidth } from './frame';

describe('frameWidth', () => {
  it('gives Home, Your account and Organization lg’s narrower frame', () => {
    expect(frameWidth('/')).toBe('lg');
    expect(frameWidth('/account')).toBe('lg');
    expect(frameWidth('/settings/organization')).toBe('lg');
  });

  it('gives every other page the 1,600 px frame, a page under a narrower one too', () => {
    expect(FRAME_WIDTH).toBe(1600);
    for (const path of [
      '/inventory',
      '/orders/0b7f6d1e-3a43-4c55-9d1a-1c8f6c2e4f10',
      '/orders/new',
      '/account/sessions',
      '/settings/roles/new',
    ]) {
      expect(frameWidth(path), path).toBe(FRAME_WIDTH);
    }
  });
});
