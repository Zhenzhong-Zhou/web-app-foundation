import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Who } from './who-and-when';

describe('Who', () => {
  it('marks a person’s name, email and initials, so a browser translating the page leaves them as typed (#245)', () => {
    render(<Who userId="user-1" name="Mei Lin" email="mei@example.com" />);

    expect(screen.getByText('Mei Lin')).toHaveAttribute('translate', 'no');
    expect(screen.getByText('mei@example.com')).toHaveAttribute(
      'translate',
      'no',
    );
    expect(screen.getByText('ML')).toHaveAttribute('translate', 'no');
  });

  it('leaves the app’s words for a removed account translatable', () => {
    render(<Who userId={null} name={null} email={null} />);

    expect(screen.getByText('A removed account')).not.toHaveAttribute(
      'translate',
    );
  });
});
