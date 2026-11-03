import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { zoneLabel } from '../lib/time-zone-label';
import { server } from '../test/setup';
import { TimeZoneForm } from './time-zone-form';

// This computer is in Vancouver, whatever machine runs the test, unless a
// test puts it elsewhere.
const computer = vi.hoisted(() => ({ zone: 'America/Vancouver' }));
vi.mock('../lib/time-zone', async (original) => ({
  ...(await original<typeof import('../lib/time-zone')>()),
  browserTimeZone: () => computer.zone,
}));

/**
 * The Profile tab's Time zone section (ADR-072), as approved on the
 * canvas. The clock is 4:28 pm on Friday 16 October in Vancouver, already
 * Saturday morning in Shanghai.
 */
describe('TimeZoneForm', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      now: new Date('2026-10-16T23:28:00.000Z'),
      toFake: ['Date'],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    computer.zone = 'America/Vancouver';
  });

  const saved = () => Promise.resolve();

  it('says what time it is there, and the offset now', () => {
    render(
      <TimeZoneForm
        value="America/Vancouver"
        readOnly={false}
        onSaved={saved}
      />,
    );

    expect(
      screen.getByText(/^It is 4:28\sPM on Friday, October 16 there\.$/),
    ).toBeInTheDocument();
    expect(
      screen.getByText('UTC\u22127 now · America/Vancouver'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save time zone' }),
    ).toBeDisabled();
  });

  it('says when saving moves the organization to another day, and saves the zone', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    server.use(
      http.patch('/api/v1/organization', async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const onSaved = vi.fn(saved);
    render(
      <TimeZoneForm
        value="America/Vancouver"
        readOnly={false}
        onSaved={onSaved}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Time zone' }));
    await user.keyboard('shanghai');
    await user.click(
      screen.getByRole('option', {
        name: `${zoneLabel('Asia/Shanghai')} UTC+8 · Asia/Shanghai`,
      }),
    );

    expect(
      screen.getByText(
        /^The organization’s today becomes Saturday, October 17\./,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save time zone' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toEqual({ timeZone: 'Asia/Shanghai' });
  });

  it('tells a screen reader what time it is in the zone chosen', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TimeZoneForm
        value="America/Vancouver"
        readOnly={false}
        onSaved={saved}
      />,
    );
    const announcement = container.querySelector('[aria-live="polite"]')!;
    expect(announcement).toBeEmptyDOMElement();

    await user.click(screen.getByRole('combobox', { name: 'Time zone' }));
    await user.keyboard('shanghai');
    await user.click(
      screen.getByRole('option', {
        name: `${zoneLabel('Asia/Shanghai')} UTC+8 · Asia/Shanghai`,
      }),
    );

    expect(announcement).toHaveTextContent(
      /^It is 7:28\sAM on Saturday, October 17 there\.$/,
    );
  });

  it("offers this computer's zone to an organization still on UTC", async () => {
    const user = userEvent.setup();
    render(<TimeZoneForm value="UTC" readOnly={false} onSaved={saved} />);

    await user.click(
      screen.getByRole('button', {
        name: `Use this device’s: ${zoneLabel('America/Vancouver')}`,
      }),
    );

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toHaveValue(
      zoneLabel('America/Vancouver'),
    );
    // Still the same day in Vancouver as in UTC at 4:28 pm: nothing moves.
    expect(screen.queryByText(/today becomes/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Save time zone' }),
    ).toBeEnabled();
  });

  it('leaves the Still on UTC note out on a computer that is itself in UTC', () => {
    computer.zone = 'UTC';
    render(<TimeZoneForm value="UTC" readOnly={false} onSaved={saved} />);

    expect(screen.queryByText(/^Still on UTC/)).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Use this device/ }),
    ).toBeNull();
  });

  // This browser, as Chrome does, lists the zone under its old name,
  // Calcutta; the picker names it as the server stores it, as Safari does.
  it('selects the stored zone, named as the server stores it', async () => {
    const user = userEvent.setup();
    render(
      <TimeZoneForm value="Asia/Kolkata" readOnly={false} onSaved={saved} />,
    );

    const box = screen.getByRole('combobox', { name: 'Time zone' });
    expect(box).toHaveValue(zoneLabel('Asia/Kolkata'));
    expect(
      screen.getByRole('button', { name: 'Save time zone' }),
    ).toBeDisabled();

    await user.clear(box);
    await user.keyboard('kolkata');
    expect(
      screen.getByRole('option', {
        name: `${zoneLabel('Asia/Kolkata')} UTC+5:30 · Asia/Kolkata`,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Calcutta/ })).toBeNull();
  });

  // The owner in Québec types the city as they write it (#165): the
  // time-zone database keeps Montreal as a link to Toronto's zone.
  it('finds a zone by a city linked to it, accents and capitals aside', async () => {
    const user = userEvent.setup();
    render(
      <TimeZoneForm
        value="America/Vancouver"
        readOnly={false}
        onSaved={saved}
      />,
    );

    const box = screen.getByRole('combobox', { name: 'Time zone' });
    await user.click(box);
    await user.keyboard('Montréal');
    expect(
      screen.getByRole('option', {
        name: `${zoneLabel('America/Toronto')} UTC\u22124 · America/Toronto`,
      }),
    ).toBeInTheDocument();

    await user.clear(box);
    await user.keyboard('CALCUTTA');
    expect(
      screen.getByRole('option', {
        name: `${zoneLabel('Asia/Kolkata')} UTC+5:30 · Asia/Kolkata`,
      }),
    ).toBeInTheDocument();

    await user.clear(box);
    await user.keyboard('Zürich');
    expect(
      screen.getByRole('option', {
        name: `${zoneLabel('Europe/Zurich')} UTC+2 · Europe/Zurich`,
      }),
    ).toBeInTheDocument();
  });

  it('says nothing was found in the words the lookup uses', async () => {
    const user = userEvent.setup();
    render(
      <TimeZoneForm
        value="America/Vancouver"
        readOnly={false}
        onSaved={saved}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Time zone' }));
    await user.keyboard('Atlantis');

    expect(screen.getByText('Nothing found.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('is read only for someone who cannot change it', () => {
    render(<TimeZoneForm value="UTC" readOnly onSaved={saved} />);

    expect(screen.getByRole('combobox', { name: 'Time zone' })).toBeDisabled();
    expect(screen.getByText('An Owner can change it.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Use this device/ }),
    ).toBeNull();
  });
});
