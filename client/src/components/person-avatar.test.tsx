import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PersonAvatar } from './person-avatar';

describe('PersonAvatar', () => {
  it('marks Chinese initials as Chinese, for a screen reader’s voice', () => {
    render(<PersonAvatar userId="user-1" name="周振中" />);
    expect(screen.getByText('振中')).toHaveAttribute('lang', 'zh');
  });

  it('leaves Latin initials to the page’s language', () => {
    render(<PersonAvatar userId="user-1" name="Mei Lin" />);
    expect(screen.getByText('ML')).not.toHaveAttribute('lang');
  });
});
