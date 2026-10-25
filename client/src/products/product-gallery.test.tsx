import { fireEvent, render, screen } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/setup';
import { deploy, OUTDATED, outdatedRefusal } from '../test/version';
import { ProductGallery } from './product-gallery';

/**
 * A photo the API refuses for this tab's revision (ADR-081): its row says
 * why as it renders, so the words follow the new version as it comes out,
 * as every refusal's do.
 */
describe('ProductGallery, a photo refused as outdated', () => {
  it('says the new version is being installed, then, once it is out, to reload', async () => {
    server.use(
      http.post('/api/v1/files/product-image', () => outdatedRefusal()),
    );
    const { container } = render(
      <ProductGallery
        productId="product-1"
        productName="Calm Blend"
        images={[]}
        canEdit
      />,
    );

    const chooser =
      container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(chooser, {
      target: {
        files: [new File(['jpeg'], 'bottle.jpg', { type: 'image/jpeg' })],
      },
    });

    expect(
      await screen.findByText(
        'A new version is being installed. Try again in a minute; nothing was saved.',
      ),
    ).toBeVisible();

    await deploy({ urgent: true });
    expect(screen.getByText(OUTDATED)).toBeVisible();
  });
});
