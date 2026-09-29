import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SettingsSection } from './settings-section';

function renderSection(
  props: Partial<Parameters<typeof SettingsSection>[0]> = {},
) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());

  render(
    <SettingsSection
      title="Base currency"
      onSubmit={onSubmit}
      error={null}
      submitting={false}
      readOnly={false}
      saveLabel="Save base currency"
      {...props}
    >
      <input aria-label="Code" />
    </SettingsSection>,
  );

  return { onSubmit };
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
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });

  it('holds Save back when the section says nothing has changed', () => {
    renderSection({ saveDisabled: true });
    expect(
      screen.getByRole('button', { name: 'Save base currency' }),
    ).toBeDisabled();
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
