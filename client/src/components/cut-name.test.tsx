import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CutName } from './cut-name';
import { CUT_NAME } from './name-column';

const NAME = 'Ashwagandha root extract, standardised to 5% withanolides';

/** The name drawn `drawn` px tall, of `whole` px of text. */
function heights(drawn: number, whole: number) {
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(drawn);
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(whole);
}

function Name() {
  return (
    <CutName name={NAME}>
      <a {...CUT_NAME} href="/items/1">
        {NAME}
      </a>
    </CutName>
  );
}

describe('CutName (ADR-090, amended November 2026; 83a)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('cut, shows the whole name on hover, the pointer resting on it, until Escape', async () => {
    // Two lines of 20 px drawn, of five.
    heights(40, 100);
    const user = userEvent.setup();
    render(<Name />);
    const link = screen.getByRole('link', { name: NAME });
    expect(link).toHaveTextContent(NAME);
    expect(link).not.toHaveAttribute('title');

    await user.hover(link);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(NAME);

    // WCAG 1.4.13: the pointer may move onto it, and it stays.
    await user.hover(tooltip);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await vi.waitFor(() =>
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument(),
    );
  });

  it('cut, shows the whole name on focus', async () => {
    heights(40, 100);
    const user = userEvent.setup();
    render(<Name />);

    await user.tab();
    expect(screen.getByRole('link', { name: NAME })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(NAME);
  });

  it('whole, shows nothing', async () => {
    heights(40, 40);
    const user = userEvent.setup();
    render(<Name />);

    await user.hover(screen.getByRole('link', { name: NAME }));
    await user.tab();

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
