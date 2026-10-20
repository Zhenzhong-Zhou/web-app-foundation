import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { GuideView } from './guide-view';
import { parseGuide } from './markdown';

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.hash}</p>;
}

function renderGuide(source: string, onFollow = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <GuideView guide={parseGuide(source)} onFollow={onFollow} />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
  return onFollow;
}

describe('GuideView', () => {
  it('draws the title, and each section by its id', () => {
    renderGuide('# Orders\n\n## Raise an order {#raise}\n\nWords.');

    expect(
      screen.getByRole('heading', { level: 2, name: 'Orders' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Raise an order' }),
    ).toHaveAttribute('id', 'help-raise');
    expect(screen.getByText('Words.')).toBeInTheDocument();
  });

  it('draws lists of both kinds, bold and a note', () => {
    renderGuide(
      '# T\n\n1. Press **Raise an order**.\n2. Choose.\n\n- One\n\n> Only some see it.',
    );

    const [ordered, unordered] = screen.getAllByRole('list');
    expect(ordered.tagName).toBe('OL');
    expect(unordered.tagName).toBe('UL');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Raise an order').tagName).toBe('STRONG');
    expect(screen.getByRole('note')).toHaveTextContent('Only some see it.');
  });

  it('follows a link through the router, to its section', async () => {
    const onFollow = renderGuide(
      '# T\n\nSee [numbering](/settings/organization#numbering).',
    );

    await userEvent.click(screen.getByRole('link', { name: 'numbering' }));

    expect(screen.getByTestId('where')).toHaveTextContent(
      '/settings/organization#numbering',
    );
    expect(onFollow).toHaveBeenCalled();
  });

  it('shows what is outside the subset as words, never as markup', () => {
    const { container } = render(
      <MemoryRouter>
        <GuideView
          guide={parseGuide(
            '# T\n\nA <b>bold</b> claim and ![x](/x.png) and [off](https://example.com).\n\n### Deeper',
          )}
        />
      </MemoryRouter>,
    );

    expect(container.querySelector('b, img')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(
      screen.getByText(
        'A <b>bold</b> claim and ![x](/x.png) and [off](https://example.com).',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('### Deeper')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
  });
});
