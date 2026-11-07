import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TestProviders } from '../test/test-providers';
import { Fixed } from './fixed';

describe('Fixed', () => {
  // While Home is customised, the part itself leaves what a screen reader
  // reads, so its lock says which part stays (WCAG 1.3.1).
  it('names the part its lock marks, for a screen reader', () => {
    render(
      <TestProviders>
        <Fixed on part="late">
          <p>2 things need you now</p>
        </Fixed>
      </TestProviders>,
    );

    const name = screen.getByText('What is late:');
    expect(name.nextElementSibling).toHaveTextContent('Fixed, cannot move');
    expect(name.closest('[inert]')).toBeNull();
    expect(
      screen.getByText('2 things need you now').closest('[inert]'),
    ).not.toBeNull();
  });

  it('draws no lock without a part, and nothing at all once Home is not customised', () => {
    const { rerender } = render(
      <TestProviders>
        <Fixed on>
          <p>Recently opened</p>
        </Fixed>
      </TestProviders>,
    );
    expect(screen.queryByText('Fixed, cannot move')).toBeNull();

    rerender(
      <TestProviders>
        <Fixed on={false} part="greeting">
          <p>Good morning</p>
        </Fixed>
      </TestProviders>,
    );
    expect(screen.queryByText('Greeting:')).toBeNull();
    const greeting = screen.getByText('Good morning');
    expect(greeting.closest('[inert]')).toBeNull();
  });
});
