import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '../test/setup';
import { RequiredNameLanguages } from './document-languages-form';

/**
 * The required-names section (ADR-054). The server does the checking at
 * issue; what matters here is that the form sends the whole list, in the
 * catalogue's order, and only when it changed.
 */
describe('RequiredNameLanguages', () => {
  it('sends the checked languages in a fixed order, and only a change', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;

    server.use(
      http.patch('/api/v1/organization', async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const onSaved = vi.fn(() => Promise.resolve());
    render(
      <RequiredNameLanguages value={[]} readOnly={false} onSaved={onSaved} />,
    );

    const save = screen.getByRole('button', { name: 'Save required names' });
    expect(save).toBeDisabled();

    // Checked back to front, sent in the catalogue's order.
    await user.click(screen.getByRole('checkbox', { name: '简体中文' }));
    await user.click(
      screen.getByRole('checkbox', { name: 'Français (Canada)' }),
    );
    await user.click(save);

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent).toEqual({ requiredNameLanguages: ['fr-CA', 'zh-Hans'] });
  });

  it('counts checking and unchecking back as no change', async () => {
    const user = userEvent.setup();

    render(
      <RequiredNameLanguages
        value={['zh-Hans']}
        readOnly={false}
        onSaved={() => Promise.resolve()}
      />,
    );

    const chinese = screen.getByRole('checkbox', { name: '简体中文' });
    await user.click(chinese);
    await user.click(chinese);

    expect(
      screen.getByRole('button', { name: 'Save required names' }),
    ).toBeDisabled();
  });
});
