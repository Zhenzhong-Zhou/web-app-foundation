import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RADIUS } from '../theme/tokens';
import { IconBadge } from './icon-badge';

describe('IconBadge', () => {
  it('is a square with the control’s corner in px, hidden from a screen reader', () => {
    const { container } = render(
      <IconBadge>
        <svg />
      </IconBadge>,
    );
    const badge = container.firstElementChild;

    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge).toHaveStyle({
      width: '40px',
      height: '40px',
      flex: 'none',
      borderRadius: `${RADIUS.control}px`,
    });
  });

  it('is a circle of the size asked for, in the colours given', () => {
    const { container } = render(
      <IconBadge round size={32} sx={{ bgcolor: '#FFFFFF' }}>
        <svg />
      </IconBadge>,
    );

    expect(container.firstElementChild).toHaveStyle({
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: '#FFFFFF',
    });
  });
});
