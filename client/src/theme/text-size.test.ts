import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { initTextSize, setTextSize, useTextSize } from './text-size';

const html = () => document.documentElement.style.fontSize;

/**
 * The text size (ADR-075): a percentage on <html>, so every rem moves with
 * it, kept on this device, and the same in every picker.
 */
describe('text size', () => {
  afterEach(() => {
    setTextSize('standard');
    localStorage.clear();
  });

  it('starts from this device’s choice, before anything renders', () => {
    localStorage.setItem('textSize', 'larger');
    initTextSize();

    expect(html()).toBe('125%');
  });

  it('treats a choice it does not know as Standard', () => {
    localStorage.setItem('textSize', 'huge');
    initTextSize();

    expect(html()).toBe('');
  });

  it('applies and remembers a choice, and Standard leaves nothing behind', () => {
    setTextSize('large');
    expect(html()).toBe('112.5%');
    expect(localStorage.getItem('textSize')).toBe('large');

    setTextSize('standard');
    expect(html()).toBe('');
    expect(localStorage.getItem('textSize')).toBeNull();
  });

  it('tells every reader when it changes', () => {
    const { result } = renderHook(() => useTextSize());
    expect(result.current[0]).toBe('standard');

    act(() => setTextSize('larger'));

    expect(result.current[0]).toBe('larger');
  });

  it('follows a change made in another tab', () => {
    initTextSize();
    const { result } = renderHook(() => useTextSize());

    // Another tab writes storage; this one hears only the event.
    localStorage.setItem('textSize', 'large');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'textSize' }));
    });

    expect(result.current[0]).toBe('large');
    expect(html()).toBe('112.5%');
  });
});
