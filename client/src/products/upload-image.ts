/** What a product image upload reports as it goes. */
export type UploadState =
  { stage: 'uploading'; percent: number } | { stage: 'sizing' };

/**
 * Uploads one photo as a product image (ADR-059), reporting how much has
 * gone and then that the server is making its sizes. XMLHttpRequest, not
 * fetch: only it reports an upload's progress. Resolves with the file's
 * id; rejects with the server's own message when it refuses one.
 */
export function uploadProductImage(
  file: File,
  onState: (state: UploadState) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', '/api/v1/files/product-image');
    // The CSRF guard's header, as api() sends on every write.
    request.setRequestHeader('X-Requested-With', 'fetch');
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

    request.onload = () => {
      const response = parse(request.responseText);
      if (request.status === 201 && response?.file?.id) {
        resolve(response.file.id);
      } else {
        // Empty when the server said nothing usable: the caller words it.
        reject(new Error(messageOf(response) ?? ''));
      }
    };
    request.onerror = () => reject(new Error(''));

    const form = new FormData();
    form.append('file', file);
    request.send(form);
  });
}

interface Response {
  file?: { id?: string };
  message?: string | string[];
}

function parse(text: string): Response | null {
  try {
    return JSON.parse(text) as Response;
  } catch {
    return null;
  }
}

function messageOf(response: Response | null): string | null {
  const message = response?.message;
  if (Array.isArray(message)) return message.join(' ');
  return message ?? null;
}
