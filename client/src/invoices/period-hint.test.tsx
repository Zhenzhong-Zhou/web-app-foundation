import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NumberingReset } from '../lib/api-names';
import { formatDay } from '../lib/format';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { NUMBERING } from '../test/handlers';
import { server } from '../test/setup';
import { PeriodHint } from './period-hint';

function serve(invoice: NumberingReset, creditNote: NumberingReset = 'never') {
  server.use(
    http.get('/api/v1/organization/numbering', () =>
      HttpResponse.json({
        numbering: {
          ...NUMBERING,
          invoice: { ...NUMBERING.invoice, reset: invoice },
          creditNote: { ...NUMBERING.creditNote, reset: creditNote },
        },
      }),
    ),
  );
}

/**
 * The line under an invoice's or credit note's date (ADR-073). Today is
 * Saturday 17 October 2026 in the organization's zone, as NUMBERING says.
 */
describe('PeriodHint', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-17T12:00:00.000Z'));
    setOrganizationTimeZone('UTC');
  });

  afterEach(() => {
    setOrganizationTimeZone(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('says a date in another year takes that year’s next number', async () => {
    serve('yearly');
    render(<PeriodHint series="invoice" day="2025-12-31" />);

    expect(
      await screen.findByText(
        'Dated in 2025, so it takes 2025’s next number, not 2026’s.',
      ),
    ).toBeInTheDocument();
  });

  it('says a date in another month takes that month’s', async () => {
    serve('monthly');
    render(<PeriodHint series="invoice" day="2026-09-30" />);

    expect(
      await screen.findByText(
        'Dated in September 2026, so it takes September 2026’s next number, not October 2026’s.',
      ),
    ).toBeInTheDocument();
  });

  it('says a date on another day takes that day’s', async () => {
    serve('daily');
    render(<PeriodHint series="invoice" day="2026-10-16" />);

    expect(
      await screen.findByText(
        `Dated ${formatDay('2026-10-16')}, so it takes that day’s next number, not today’s.`,
      ),
    ).toBeInTheDocument();
  });

  it('says nothing for today, and reads nothing to say it', () => {
    serve('daily');
    const fetched = vi.spyOn(globalThis, 'fetch');
    const { container } = render(
      <PeriodHint series="invoice" day="2026-10-17" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(fetched).not.toHaveBeenCalled();
  });

  it('says nothing for a series that never starts again', async () => {
    serve('never', 'yearly');
    render(
      <>
        <PeriodHint series="invoice" day="2025-12-31" />
        <PeriodHint series="creditNote" day="2025-12-31" />
      </>,
    );

    // The credit note's line shows the numbering has arrived; the
    // invoice's, with no reset, stays away.
    expect(await screen.findAllByText(/^Dated in 2025/)).toHaveLength(1);
  });
});
