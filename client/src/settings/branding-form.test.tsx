import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { OrganizationLogoKind } from '../lib/api-names';
import { server } from '../test/setup';
import { BrandingForm } from './branding-form';

function renderForm({
  name = 'WIDE Naturals Inc.',
  logoFileId = null,
  squareLogoFileId = null,
}: {
  name?: string;
  logoFileId?: string | null;
  squareLogoFileId?: string | null;
} = {}) {
  const onSaved = vi.fn(() => Promise.resolve());
  const view = render(
    <BrandingForm
      name={name}
      logoFileId={logoFileId}
      squareLogoFileId={squareLogoFileId}
      accentColor={null}
      rail="dark"
      onSaved={onSaved}
    />,
  );
  return { ...view, onSaved };
}

/** A logo's row, a group named by its heading. */
const row = (name: 'Logo' | 'Square logo') =>
  screen.getByRole('group', { name });

/** The square logo's line, its first sentence and what follows it. */
const squareLine = () =>
  within(row('Square logo')).getByText(
    'For small spaces, such as the folded sidebar.',
  );

/**
 * The two sidebar previews, a picture under their heading, both hidden from
 * a screen reader.
 */
const preview = () =>
  screen.getByRole('heading', {
    name: 'How it looks in the sidebar',
    hidden: true,
  }).nextElementSibling as HTMLElement;

/** The main logo loaded at its own size, as the browser reads it. */
function loads(container: HTMLElement, width: number, height: number) {
  const image = container.querySelector<HTMLImageElement>('img[hidden]')!;
  Object.defineProperty(image, 'naturalWidth', { value: width });
  Object.defineProperty(image, 'naturalHeight', { value: height });
  fireEvent.load(image);
}

/** What an upload route answers, for the kind it keeps. */
function stored(id: string, kind: OrganizationLogoKind) {
  return HttpResponse.json(
    {
      file: {
        id,
        kind,
        contentType: 'image/png',
        sizes: { full: { width: 512, height: 512, bytes: 2048 } },
        createdAt: '2026-10-25T12:00:00.000Z',
      },
    },
    { status: 201 },
  );
}

/**
 * A file chosen in a row's picker. Synchronous, so what the row shows while
 * the upload runs can be read before any answer comes: an answer held back
 * in the handler instead fails under MSW, with a file in the body.
 */
function choose(name: 'Logo' | 'Square logo') {
  const input =
    row(name).querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, {
    target: {
      files: [new File(['<svg/>'], 'mark.svg', { type: 'image/svg+xml' })],
    },
  });
}

/**
 * Branding's two logos (ADR-060, amended), as Square-logo-two-up draws
 * them: one row each, the square logo's line saying what shows on the
 * folded plate without one, and the preview's plate by the rail's rule.
 */
describe('BrandingForm, the two logos', () => {
  it('has a row for each, saying what it is for', () => {
    renderForm();

    const logo = row('Logo');
    expect(
      within(logo).getByRole('heading', { level: 3, name: 'Logo' }),
    ).toBeVisible();
    expect(
      within(logo).getByText('Wide or square, at the top of the sidebar.'),
    ).toBeVisible();
    expect(
      within(logo).getByRole('button', { name: 'Upload a logo' }),
    ).toBeVisible();
    expect(
      within(logo).getByText(
        'PNG, JPEG, WebP or SVG, at least 256 pixels wide, up to 2 MB.',
      ),
    ).toBeVisible();

    const square = row('Square logo');
    expect(
      within(square).getByRole('heading', { level: 3, name: 'Square logo' }),
    ).toBeVisible();
    expect(within(square).getByText('Optional')).toBeVisible();
    expect(
      within(square).getByRole('button', { name: 'Upload a square logo' }),
    ).toBeVisible();
    expect(
      within(square).getByText(
        'About square, at least 128 pixels on each side. PNG, JPEG, WebP or SVG, up to 2 MB.',
      ),
    ).toBeVisible();
    expect(within(logo).queryByText('Optional')).toBeNull();
  });

  it('uploads a square logo, saying so while it runs, and keeps Save waiting', async () => {
    server.use(
      http.post('/api/v1/files/square-logo', () =>
        stored('mark-1', 'square_logo'),
      ),
    );
    renderForm();
    const square = row('Square logo');
    const save = screen.getByRole('button', { name: 'Save branding' });

    choose('Square logo');

    // In words, so a screen reader hears it, beside the button it waits on.
    expect(within(square).getByRole('status')).toHaveTextContent('Uploading…');
    expect(
      within(square).getByRole('button', { name: 'Upload a square logo' }),
    ).toHaveAttribute('aria-disabled', 'true');
    expect(save).toBeDisabled();
    // The other row is not uploading.
    expect(within(row('Logo')).getByRole('status')).toBeEmptyDOMElement();

    // Done, and how to keep it: nothing is kept until Save.
    await waitFor(() =>
      expect(within(square).getByRole('status')).toHaveTextContent(
        /^Uploaded\. Press Save branding to use it\.$/,
      ),
    );
    expect(save).toBeEnabled();
    // Its thumbnail from the larger of the two sizes it keeps.
    expect(square.querySelector('img')).toHaveAttribute(
      'src',
      '/api/v1/files/mark-1?size=full',
    );
    expect(
      within(square).getByRole('button', { name: 'Replace' }),
    ).toBeVisible();
    expect(
      within(square).getByRole('button', { name: 'Remove' }),
    ).toBeVisible();
  });

  it('says Uploading… for the logo too', async () => {
    server.use(
      http.post('/api/v1/files/logo', () => stored('wordmark-1', 'logo')),
    );
    renderForm();

    choose('Logo');

    expect(within(row('Logo')).getByRole('status')).toHaveTextContent(
      'Uploading…',
    );
    expect(
      screen.getByRole('button', { name: 'Save branding' }),
    ).toBeDisabled();

    await waitFor(() =>
      expect(row('Logo').querySelector('img')).toHaveAttribute(
        'src',
        '/api/v1/files/wordmark-1',
      ),
    );
    expect(within(row('Logo')).getByRole('status')).toHaveTextContent(
      'Uploaded. Press Save branding to use it.',
    );
  });

  it('stops saying Uploaded once the logo is removed', async () => {
    server.use(
      http.post('/api/v1/files/square-logo', () =>
        stored('mark-1', 'square_logo'),
      ),
    );
    const user = userEvent.setup();
    renderForm();
    const square = row('Square logo');

    choose('Square logo');
    await waitFor(() =>
      expect(within(square).getByRole('status')).toHaveTextContent('Uploaded.'),
    );
    await user.click(within(square).getByRole('button', { name: 'Remove' }));

    expect(within(square).getByRole('status')).toBeEmptyDOMElement();
  });

  it('shows a refusal in its own row, and keeps nothing', async () => {
    server.use(
      http.post('/api/v1/files/square-logo', () =>
        HttpResponse.json(
          {
            statusCode: 400,
            message:
              'A square logo must be about square, at most 5 : 4 either way. Use a wide image as the main logo.',
          },
          { status: 400 },
        ),
      ),
    );
    renderForm();

    choose('Square logo');

    expect(
      await within(row('Square logo')).findByRole('alert'),
    ).toHaveTextContent(/^A square logo must be about square/);
    expect(within(row('Logo')).queryByRole('alert')).toBeNull();
    expect(row('Square logo').querySelector('img')).toBeNull();
    expect(
      within(row('Square logo')).getByRole('status'),
    ).toBeEmptyDOMElement();
  });

  it('sends both logos with Save, and a removed one as none', async () => {
    let sent: unknown = null;
    server.use(
      http.patch('/api/v1/organization', async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    const { onSaved } = renderForm({
      logoFileId: 'wordmark',
      squareLogoFileId: 'mark',
    });

    await user.click(
      within(row('Square logo')).getByRole('button', { name: 'Remove' }),
    );
    expect(
      within(row('Square logo')).getByRole('button', {
        name: 'Upload a square logo',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save branding' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    expect(sent).toEqual({
      logoFileId: 'wordmark',
      squareLogoFileId: null,
      accentColor: null,
      rail: 'dark',
    });
  });

  it.each([
    ['Logo', 'Upload a logo'],
    ['Square logo', 'Upload a square logo'],
  ] as const)(
    'moves focus to the upload button once %s is removed',
    async (name, upload) => {
      const user = userEvent.setup();
      renderForm({ logoFileId: 'wordmark', squareLogoFileId: 'mark' });

      within(row(name)).getByRole('button', { name: 'Remove' }).focus();
      await user.keyboard('{Enter}');

      // Not left on the page, where Remove was.
      expect(
        within(row(name)).getByRole('button', { name: upload }),
      ).toHaveFocus();
    },
  );

  it('shows the colour on a sample under its caption, never a second Save', () => {
    renderForm();

    // The one Save branding is the button that saves.
    expect(screen.getAllByText('Save branding')).toHaveLength(1);
    const sample = screen.getByText('Example');
    expect(sample.previousElementSibling).toHaveTextContent(
      'Buttons will look like this:',
    );
    expect(sample).toHaveStyle({
      backgroundColor: '#5546B8',
      color: '#FFFFFF',
    });
    // A picture of a button, not one: nothing to press or tab to.
    expect(sample.closest('button, [role="button"], [tabindex]')).toBeNull();
    expect(sample.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  /** What the folded plate shows without a square logo (usePlate). */
  describe('the square logo’s line, without one', () => {
    it('names the initials, in the plate’s colours, with no logo', () => {
      renderForm();

      expect(squareLine()).toHaveTextContent(
        /^For small spaces, such as the folded sidebar\.Without one, the initials WN show there\.$/,
      );
      // The text itself, so a screen reader reads it.
      const chip = within(squareLine()).getByText('WN');
      expect(chip).toHaveStyle({
        backgroundColor: '#5546B8',
        color: '#FFFFFF',
      });
    });

    it('marks Chinese initials as Chinese', () => {
      renderForm({ name: '清禾药业有限公司' });

      expect(within(squareLine()).getByText('清禾')).toHaveAttribute(
        'lang',
        'zh',
      );
    });

    it('says the logo already shows there, once it is read to be about square', () => {
      const { container } = renderForm({ logoFileId: 'square-wordmark' });
      // Nothing more while the logo's shape is unknown.
      expect(squareLine()).toHaveTextContent(
        /^For small spaces, such as the folded sidebar\.$/,
      );

      loads(container, 200, 180);

      expect(squareLine()).toHaveTextContent(
        'Your logo is about square, so it already shows there; upload one only for a different mark.',
      );
    });

    it('names the initials for a wide logo', () => {
      const { container } = renderForm({ logoFileId: 'wordmark' });

      loads(container, 400, 100);

      expect(within(squareLine()).getByText('WN')).toBeVisible();
    });

    it('says only what it is for, with a square logo', () => {
      const { container } = renderForm({ squareLogoFileId: 'mark' });

      expect(squareLine()).toHaveTextContent(
        /^For small spaces, such as the folded sidebar\.$/,
      );
      expect(container.querySelector('img[hidden]')).toBeNull();
    });
  });

  /** Each shade's rail, open and folded, by the rail's own rule. */
  describe('the preview', () => {
    it('is a picture a screen reader skips, its heading too', () => {
      renderForm();

      expect(
        screen.queryByRole('heading', { name: 'How it looks in the sidebar' }),
      ).toBeNull();
      expect(preview().closest('[aria-hidden="true"]')).not.toBeNull();
    });

    it('shows the initials on each folded plate, and the name open, with no logo', () => {
      renderForm();

      expect(within(preview()).getAllByText('WN')).toHaveLength(2);
      expect(within(preview()).getAllByText('WIDE Naturals Inc.')).toHaveLength(
        2,
      );
      expect(preview().querySelector('img')).toBeNull();
    });

    it('shows the square logo on each plate, and beside the name with no main logo', () => {
      renderForm({ squareLogoFileId: 'mark' });

      // Two open, beside the name, and two folded, all from the small file.
      expect(
        preview().querySelectorAll('img[src="/api/v1/files/mark?size=thumb"]'),
      ).toHaveLength(4);
      expect(within(preview()).getAllByText('WIDE Naturals Inc.')).toHaveLength(
        2,
      );
      expect(within(preview()).queryByText('WN')).toBeNull();
    });

    it('shows the main logo open and the square logo folded, with both', () => {
      renderForm({ logoFileId: 'wordmark', squareLogoFileId: 'mark' });

      expect(
        preview().querySelectorAll('img[src="/api/v1/files/wordmark"]'),
      ).toHaveLength(2);
      expect(
        preview().querySelectorAll('img[src="/api/v1/files/mark?size=thumb"]'),
      ).toHaveLength(2);
      expect(within(preview()).queryByText('WIDE Naturals Inc.')).toBeNull();
    });

    it('shows a square main logo on each plate once it is read', () => {
      const { container } = renderForm({ logoFileId: 'square-wordmark' });
      expect(within(preview()).queryByText('WN')).toBeNull();

      loads(container, 200, 180);

      // Open and folded, on each shade.
      expect(
        preview().querySelectorAll('img[src="/api/v1/files/square-wordmark"]'),
      ).toHaveLength(4);
    });
  });
});
