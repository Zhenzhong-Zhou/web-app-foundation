import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SubmitEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SettingsSection } from './settings-section';

type Props = Partial<Parameters<typeof SettingsSection>[0]>;

function renderSection(props: Props = {}) {
  const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
  const section = (over: Props) => (
    <SettingsSection
      title="Base currency"
      onSubmit={onSubmit}
      error={null}
      submitting={false}
      readOnly={false}
      saveLabel="Save base currency"
      {...over}
    >
      <input aria-label="Code" />
    </SettingsSection>
  );

  const { rerender } = render(section(props));

  return { onSubmit, rerender: (over: Props) => rerender(section(over)) };
}

describe('SettingsSection', () => {
  it('is a titled form of its own that saves on its own', async () => {
    const { onSubmit } = renderSection();

    expect(
      screen.getByRole('heading', { name: 'Base currency' }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Save base currency' }),
    );
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /** A button someone can never press is noise, so it is not there at all. */
  it('has no Save for someone who can only read', () => {
    renderSection({ readOnly: true });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('holds Save back while saving', () => {
    renderSection({ submitting: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('holds Save back when the section says nothing has changed', () => {
    renderSection({ saveDisabled: true });
    expect(
      screen.getByRole('button', { name: 'Save base currency' }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  /**
   * A disabled button drops its focus to the page, and a keyboard or
   * screen-reader user starts again from the top (#155, WCAG 2.4.3).
   */
  it('keeps focus on Save as it saves, and ignores a press while held back', async () => {
    const user = userEvent.setup();
    const { onSubmit, rerender } = renderSection();
    const save = screen.getByRole('button', { name: 'Save base currency' });

    save.focus();
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender({ submitting: true });
    expect(save).toHaveAccessibleName('Saving…');
    expect(save).toHaveAttribute('aria-disabled', 'true');
    expect(save).not.toBeDisabled();
    expect(save).toHaveFocus();
    await user.keyboard('{Enter}');

    // Saved, and nothing changed since.
    rerender({ saveDisabled: true });
    expect(save).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.type(screen.getByRole('textbox', { name: 'Code' }), '{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender({});
    expect(save).not.toHaveAttribute('aria-disabled');
  });

  it('says its notice before the error', () => {
    renderSection({
      notice: <p>Not set yet.</p>,
      error: 'That currency is not recognised.',
    });

    const notice = screen.getByText('Not set yet.');
    const error = screen.getByText('That currency is not recognised.');
    expect(
      notice.compareDocumentPosition(error) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
