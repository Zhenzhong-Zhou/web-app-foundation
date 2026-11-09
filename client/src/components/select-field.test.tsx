import { MenuItem } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SelectField } from './select-field';

function Category({ start = '' }: { start?: string }) {
  const [value, setValue] = useState(start);

  return (
    <>
      <SelectField
        label="Category"
        emptyLabel="All categories"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      >
        <MenuItem value="vitamins">Vitamins</MenuItem>
        <MenuItem value="fish-oil">Fish oil</MenuItem>
      </SelectField>
      <p>chosen {value || 'none'}</p>
    </>
  );
}

describe('SelectField', () => {
  // #274: the empty choice reads as a choice, never a blank box.
  it('shows the empty choice in words, under its label', () => {
    render(<Category />);

    const select = screen.getByRole('combobox', { name: /^Category/ });
    expect(select).toHaveTextContent('All categories');
    // Above the box, so the words in it show.
    expect(
      screen.getByText('Category', { selector: '.MuiInputLabel-root' }),
    ).toHaveAttribute('data-shrink', 'true');
  });

  it('offers the empty choice first, and gives back its empty value', async () => {
    render(<Category start="vitamins" />);
    const select = screen.getByRole('combobox', { name: /^Category/ });
    expect(select).toHaveTextContent('Vitamins');

    await userEvent.click(select);
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['All categories', 'Vitamins', 'Fish oil']);

    await userEvent.click(
      screen.getByRole('option', { name: 'All categories' }),
    );
    expect(screen.getByText('chosen none')).toBeInTheDocument();
    expect(select).toHaveTextContent('All categories');
  });
});
