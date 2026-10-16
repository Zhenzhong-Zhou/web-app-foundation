import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { Location } from '../api/types.gen';
import { SiteSelect } from './site-select';

function location(over: Partial<Location>): Location {
  return {
    id: 'loc',
    type: 'site',
    name: 'Site',
    code: null,
    parentId: null,
    isAvailable: true,
    isActive: true,
    address: null,
    ...over,
  };
}

const BURNABY = location({
  id: 'burnaby',
  name: 'Burnaby warehouse',
  address: {
    line1: '42 Production Way',
    line2: null,
    city: 'Burnaby',
    region: 'BC',
    postalCode: 'V5J 4R1',
    country: 'CA',
  },
});
const ANNEX = location({ id: 'annex', name: 'Annex' });
const BIN = location({
  id: 'bin',
  type: 'bin',
  name: 'Bin 4',
  parentId: 'burnaby',
});
const OLD = location({ id: 'old', name: 'Old depot', isActive: false });

function picker(value: string, current: { id: string; name: string } | null) {
  return (
    <SiteSelect
      id="deliver-to"
      label="Deliver to"
      value={value}
      onChange={() => undefined}
      locations={[BURNABY, ANNEX, BIN, OLD]}
      current={current}
      emptyLabel="Not chosen"
      emptyHelp="The purchase order prints the registered address."
    />
  );
}

describe('SiteSelect (ADR-071)', () => {
  it('offers active sites, and the one already chosen once retired', async () => {
    const user = userEvent.setup();
    render(picker('old', { id: 'old', name: 'Old depot' }));

    await user.click(screen.getByRole('combobox', { name: 'Deliver to' }));
    const options = within(screen.getByRole('listbox')).getAllByRole('option');

    // Not a bin inside a site, and not another retired one.
    expect(options.map((option) => option.textContent)).toEqual([
      'Not chosen',
      'Burnaby warehouse',
      'Annex',
      'Old depot',
    ]);
  });

  it('says where the chosen site is, or that it has no address yet', () => {
    const { rerender } = render(picker('burnaby', null));
    expect(screen.getByText('42 Production Way, Burnaby')).toBeInTheDocument();

    rerender(picker('annex', null));
    expect(
      screen.getByText(/No address yet, so the document prints/),
    ).toBeInTheDocument();

    rerender(picker('', null));
    expect(
      screen.getByText('The purchase order prints the registered address.'),
    ).toBeInTheDocument();
  });

  it('says nothing of an address before the sites have loaded', () => {
    render(
      <SiteSelect
        id="send-back-to"
        label="Send back to"
        value="annex"
        onChange={() => undefined}
        locations={[]}
        current={{ id: 'annex', name: 'Annex' }}
        emptyLabel="Not chosen"
        emptyHelp="The RMA prints the registered address."
      />,
    );

    expect(
      screen.getByRole('combobox', { name: 'Send back to' }),
    ).toHaveTextContent('Annex');
    expect(screen.queryByText(/No address yet/)).not.toBeInTheDocument();
  });
});
