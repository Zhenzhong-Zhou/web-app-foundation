import { fireEvent } from '@testing-library/react';

/**
 * The hidden image usePlate measures, loaded at its own size, as the
 * browser reads it: jsdom loads nothing, so the size is given here.
 */
export function loads(container: HTMLElement, width: number, height: number) {
  const image = container.querySelector<HTMLImageElement>('img[hidden]')!;
  Object.defineProperty(image, 'naturalWidth', { value: width });
  Object.defineProperty(image, 'naturalHeight', { value: height });
  fireEvent.load(image);
}
