import { apiHeaders, refusalFrom } from '../lib/api';

/** What a product image upload reports as it goes. */
export type UploadState =
  { stage: 'uploading'; percent: number } | { stage: 'sizing' };

/**
 * Uploads one photo as a product image (ADR-059), reporting how much has
 * gone and then that the server is making its sizes. XMLHttpRequest, not
 * fetch: only it reports an upload's progress. Resolves with the file's
 * id.
 *
 * A write outside api(), so it sends what api() sends (apiHeaders) and
 * fails as api() fails: a refusal as the same ApiError, an outdated tab's
 * noted as api() notes it (ADR-081), and no answer at all as fetch's
 * TypeError, so the screen words each as it words any other.
 */
export function uploadProductImage(
  file: File,
  onState: (state: UploadState) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/v1/files/product-image');
    for (const [name, value] of Object.entries(apiHeaders())) {
      request.setRequestHeader(name, value);
    }
    request.withCredentials = true;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onState({
          stage: 'uploading',
          percent: Math.round((event.loaded / event.total) * 100),
        });
      }
    };
    request.upload.onload = () => onState({ stage: 'sizing' });

    request.onload = async () => {
      const response = parse(request.responseText);
      if (request.status === 201 && response?.file?.id) {
        resolve(response.file.id);
        return;
      }
      reject(
        await refusalFrom(
          request.status,
          response,
          request.getResponseHeader('Retry-After'),
        ),
      );
    };
    request.onerror = () => reject(new TypeError('Failed to fetch'));

    const form = new FormData();
    form.append('file', file);
    request.send(form);
  });
}

interface Response {
  file?: { id?: string };
  message?: string | string[];
  requestId?: string;
  code?: string;
}

function parse(text: string): Response | null {
  try {
    return JSON.parse(text) as Response;
  } catch {
    return null;
  }
}
