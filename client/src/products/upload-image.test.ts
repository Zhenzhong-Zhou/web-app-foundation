import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { API_REVISION } from '../api/revision.gen';
import { apiError } from '../test/handlers';
import { server } from '../test/setup';
import {
  checkVersion,
  newVersionNow,
  noteServed,
} from '../version/version-check';
import { uploadProductImage } from './upload-image';

const photo = () => new File(['jpeg'], 'bottle.jpg', { type: 'image/jpeg' });

beforeEach(async () => {
  noteServed();
  await checkVersion();
});

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

  it('notes a refusal as outdated before it rejects with the server’s words', async () => {
    const words =
      'This tab is running an older version of the app, so nothing was saved. Copy anything you typed, then reload.';
    server.use(
      http.post('/api/v1/files/product-image', () =>
        apiError(409, words, 'client_outdated'),
      ),
    );

    await expect(uploadProductImage(photo(), () => undefined)).rejects.toThrow(
      words,
    );
    expect(newVersionNow().outdated).toBe(true);
  });
});
