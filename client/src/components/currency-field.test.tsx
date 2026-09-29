import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CurrencyField } from './currency-field';

function Harness(props: { onChange?: (currency: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <CurrencyField
      id="test-currency"
      value={value}
      onChange={(currency) => {
        setValue(currency);
        props.onChange?.(currency);
      }}
      helperText="For any prices below"
    />
  );
}

const field = () => screen.getByRole('textbox', { name: 'Currency' });

describe('CurrencyField', () => {
  it('uppercases as it is typed, and hands the caller the code', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await userEvent.type(field(), 'cad');

    expect(field()).toHaveValue('CAD');
    expect(onChange).toHaveBeenLastCalledWith('CAD');
  });

  it('stops at three letters', async () => {
    render(<Harness />);

    await userEvent.type(field(), 'usdx');

    expect(field()).toHaveValue('USD');
  });

  it('passes everything else through', () => {
    render(
      <CurrencyField
        id="base"
        label="Base currency"
        value="CAD"
        onChange={() => undefined}
        disabled
        required
        helperText="What stock is valued in"
      />,
    );

    const input = screen.getByRole('textbox', { name: /Base currency/ });
    expect(input).toBeDisabled();
    expect(input).toBeRequired();
    expect(screen.getByText('What stock is valued in')).toBeInTheDocument();
  });
});
