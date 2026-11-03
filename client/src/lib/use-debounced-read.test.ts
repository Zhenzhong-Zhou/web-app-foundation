import { renderHook, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '../test/setup';
import { ApiError } from './api';
import { type Question, useDebouncedRead } from './use-debounced-read';

type Figure = { figure: string };

const BASE = '/api/v1';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Each figure asked for, in the order the server is asked. */
function figures(
  answer: (figure: string) => Promise<Response> | Response = (figure) =>
    HttpResponse.json({ figure }),
): string[] {
  const asked: string[] = [];
  server.use(
    http.get(`${BASE}/figures`, ({ request }) => {
      const figure = new URL(request.url).searchParams.get('figure') ?? '';
      asked.push(figure);
      return answer(figure);
    }),
  );
  return asked;
}

function render(first: Question | null) {
  return renderHook(
    ({ question }: { question: Question | null }) =>
      useDebouncedRead<Figure>(question),
    { initialProps: { question: first } },
  );
}

const of = (figure: string): Question => ({
  path: `/figures?figure=${figure}`,
});

describe('useDebouncedRead', () => {
  it('asks once typing pauses, and keeps the answer with its question', async () => {
    const asked = figures();
    const { result, rerender } = render(of('1'));
    rerender({ question: of('12') });
    rerender({ question: of('120') });

    await waitFor(() => expect(result.current?.value?.figure).toBe('120'));
    expect(result.current?.question).toEqual(of('120'));
    expect(result.current?.failure).toBeNull();
    // Typed within the pause: one question, not one a key.
    expect(asked).toEqual(['120']);
  });

  it('asks by POST when the question has a body', async () => {
    let sent: unknown = null;
    server.use(
      http.post(`${BASE}/figures/preview`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ figure: 'posted' });
      }),
    );

    const { result } = render({
      path: '/figures/preview',
      body: JSON.stringify({ quantity: '6' }),
    });

    await waitFor(() => expect(result.current?.value?.figure).toBe('posted'));
    expect(sent).toEqual({ quantity: '6' });
  });

  it('answers a failure with what the read threw', async () => {
    figures(() =>
      HttpResponse.json({ message: 'Type a number.' }, { status: 400 }),
    );
    const { result } = render(of('x'));

    await waitFor(() =>
      expect(result.current?.failure).toBeInstanceOf(ApiError),
    );
    expect((result.current?.failure as ApiError).message).toBe(
      'Type a number.',
    );
    expect(result.current?.value).toBeNull();
    expect(result.current?.question).toEqual(of('x'));
  });

  it('drops an answer that comes after a newer question', async () => {
    figures(async (figure) => {
      if (figure === '200') await delay(700);
      return HttpResponse.json({ figure });
    });
    const { result, rerender } = render(of('200'));
    // Asked, and still waiting, when the question changes.
    await wait(400);
    rerender({ question: of('2000') });

    await waitFor(() => expect(result.current?.value?.figure).toBe('2000'));
    await wait(700);
    expect(result.current?.value?.figure).toBe('2000');
  });

  it('asks nothing while there is no question, and keeps the last answer', async () => {
    const asked = figures();
    const { result, rerender } = render(null);
    await wait(400);
    expect(asked).toEqual([]);
    expect(result.current).toBeNull();

    rerender({ question: of('5') });
    await waitFor(() => expect(result.current?.value?.figure).toBe('5'));
    rerender({ question: null });
    await wait(400);

    expect(asked).toEqual(['5']);
    expect(result.current?.question).toEqual(of('5'));
  });
});
