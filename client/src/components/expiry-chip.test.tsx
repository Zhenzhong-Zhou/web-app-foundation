import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ExpiryChip } from './expiry-chip';

const TODAY = '2026-10-07';

describe('ExpiryChip', () => {
  it('says how many days are left, and the date beside it', () => {
    render(<ExpiryChip expiresAt="2026-10-27" today={TODAY} />);

    expect(screen.getByText('Expires in 20 days')).toBeInTheDocument();
    expect(screen.getByText(/Oct 27, 2026|27 Oct 2026/)).toBeInTheDocument();
  });

  it('says how long ago an expired lot expired', () => {
    render(<ExpiryChip expiresAt="2026-10-05" today={TODAY} />);

    expect(screen.getByText('Expired 2 days ago')).toBeInTheDocument();
  });

  it('shows the date alone when expiry is far off', () => {
    render(<ExpiryChip expiresAt="2028-05-29" today={TODAY} />);

    expect(screen.queryByText(/Expires in/)).not.toBeInTheDocument();
    expect(screen.getByText(/2028/)).toBeInTheDocument();
  });

  it('shows a dash for a lot that does not expire', () => {
    render(<ExpiryChip expiresAt={null} today={TODAY} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
