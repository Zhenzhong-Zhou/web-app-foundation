import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { ApiError } from '../lib/api';
import { server } from '../test/setup';
import { OUTDATED, outdatedRefusal } from '../test/version';
import { newVersionNow } from '../version/version-check';
import { uploadProductImage } from './upload-image';

const photo = () => new File(['jpeg'], 'bottle.jpg', { type: 'image/jpeg' });

/**
 * A write outside api(), for its progress (ADR-059), so it sends the API
 * revision itself, and its refusal as outdated is noted as api()'s is
 * (ADR-081).
 */
describe('uploadProductImage', () => {
  it('sends the API revision, with the CSRF header', async () => {
    let headers: Headers | null = null;
    server.use(
      http.post('/api/v1/files/product-image', ({ request }) => {
        headers = request.headers;
        return HttpResponse.json({ file: { id: 'file-1' } }, { status: 201 });
      }),
    );

    expect(await uploadProductImage(photo(), () => undefined)).toBe('file-1');
    expect(headers!.get('X-Api-Revision')).toBe(String(API_REVISION));
    expect(headers!.get('X-Requested-With')).toBeTruthy();
  });

  it('notes a refusal as outdated, then rejects with the ApiError api() would', async () => {
    server.use(
      http.post('/api/v1/files/product-image', () => outdatedRefusal()),
    );

    const refusal: unknown = await uploadProductImage(
      photo(),
      () => undefined,
    ).catch((caught: unknown) => caught);
    expect(refusal).toBeInstanceOf(ApiError);
    expect((refusal as ApiError).message).toBe(OUTDATED);
    expect((refusal as ApiError).code).toBe('client_outdated');
    expect(newVersionNow().outdated).toBe(true);
  });

  it('rejects as fetch does when no answer comes back', async () => {
    server.use(
      http.post('/api/v1/files/product-image', () => HttpResponse.error()),
    );

    await expect(
      uploadProductImage(photo(), () => undefined),
    ).rejects.toBeInstanceOf(TypeError);
  });
});
