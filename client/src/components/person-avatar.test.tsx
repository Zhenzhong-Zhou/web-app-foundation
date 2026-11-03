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

  // Its alt is the name, which a browser translating the page leaves as
  // typed (#245).
  it('keeps the photo’s name as typed under translation', () => {
    render(<PersonAvatar userId="user-1" name="Mei Lin" photoFileId="p1" />);
    expect(screen.getByRole('img', { name: 'Mei Lin' })).toHaveAttribute(
      'translate',
      'no',
    );
  });
});
