import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Reference, ReferencesWhole } from './reference';

/** Whether the line may break inside the element that holds `text` alone. */
const keptWhole = (text: string) =>
  getComputedStyle(screen.getByText(text)).whiteSpace === 'nowrap';

describe('Reference (ADR-081)', () => {
  it('keeps a code whole, its hyphen as typed, so a copy pastes into the lookup', () => {
    const { container } = render(
      <p>
        Receive <Reference>VIT-C-500</Reference>
      </p>,
    );

    expect(keptWhole('VIT-C-500')).toBe(true);
    // Never the non-breaking hyphen, U+2011, which the lookup would not find.
    expect(container.textContent).toBe('Receive VIT-C-500');
  });

  it('leaves a code longer than a phone’s line to break rather than run off it', () => {
    render(
      <p>
        Receive <Reference>{'BATCH-2026-10-22-NORTH'}</Reference>
      </p>,
    );

    expect(screen.queryByText('BATCH-2026-10-22-NORTH')).toBeNull();
    expect(screen.getByText('Receive BATCH-2026-10-22-NORTH')).toBeVisible();
  });
});

describe('ReferencesWhole (ADR-081)', () => {
  it('keeps each word with a hyphen whole in the server’s words, and only those', () => {
    const { container } = render(
      <p>
        <ReferencesWhole text="Pharmacie Saint-Laurent · SO-DEMO-QC" />
      </p>,
    );

    expect(keptWhole('SO-DEMO-QC')).toBe(true);
    expect(keptWhole('Saint-Laurent')).toBe(true);
    expect(container.textContent).toBe('Pharmacie Saint-Laurent · SO-DEMO-QC');
    expect(container.querySelectorAll('span')).toHaveLength(2);
  });

  it('ends a word at Chinese text and its punctuation, which break anywhere', () => {
    const text = '许可证 LIC-1（Health Canada）已于 2026-10-22 到期';
    const { container } = render(
      <p>
        <ReferencesWhole text={text} />
      </p>,
    );

    expect(keptWhole('LIC-1')).toBe(true);
    expect(keptWhole('2026-10-22')).toBe(true);
    expect(container.textContent).toBe(text);
  });

  it('leaves words without a hyphen as they are', () => {
    const { container } = render(
      <p>
        <ReferencesWhole text="Northside Pharmacy" />
      </p>,
    );

    expect(container.querySelector('span')).toBeNull();
  });
});
