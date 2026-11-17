import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { NameAndCode } from './name-and-code';

const VITAMIN_C = {
  name: 'Vitamin C 500 mg',
  code: 'VITC-100',
  type: 'good',
  coverFileId: null,
} as const;

/** One cell for an item's name and code (ADR-093, the design language's Rows). */
describe('NameAndCode', () => {
  it('puts the name first and its code after it, the name the row’s one link', () => {
    const { container } = render(
      <MemoryRouter>
        <NameAndCode {...VITAMIN_C} to="/items/vitamin-c" />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Vitamin C 500 mg' });
    expect(link).toHaveAttribute('href', '/items/vitamin-c');
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(container).toHaveTextContent(/^Vitamin C 500 mgVITC-100$/);
    // The type's icon where there is no cover, hidden from a screen reader.
    expect(container.querySelector('[aria-hidden] svg')).not.toBeNull();
  });

  // #548: an icon that tells a kind is never alone.
  it('shows the type as a word beside its code where rows of every type sit together', () => {
    render(
      <MemoryRouter>
        <NameAndCode
          {...VITAMIN_C}
          type="material"
          to="/items/vitamin-c"
          withType
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('link', { name: 'Vitamin C 500 mg' }),
    ).toBeVisible();
    expect(screen.getByText('VITC-100 · Raw material')).toBeVisible();
  });

  // A card is one link whole, and a link holds no other.
  it('draws the name as text without a link', () => {
    render(<NameAndCode {...VITAMIN_C} code="VITC-100 · Vitamins" />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('Vitamin C 500 mg')).toBeVisible();
    expect(screen.getByText('VITC-100 · Vitamins')).toBeVisible();
  });

  it('shows the cover where there is one', () => {
    render(<NameAndCode {...VITAMIN_C} coverFileId="file-1" />);

    expect(
      screen.getByRole('img', { name: 'Vitamin C 500 mg' }),
    ).toHaveAttribute('src', '/api/v1/files/file-1?size=thumb');
  });
});
