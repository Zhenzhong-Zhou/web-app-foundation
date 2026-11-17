import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { apiError, LOCATIONS } from '../test/handlers';
import { server } from '../test/setup';
import { useLocations } from './use-locations';

/** One read of the locations, as usePartners is of the partners (#282). */
describe('useLocations', () => {
  it('reads the locations once active', async () => {
    const { result } = renderHook(() => useLocations(true));

    expect(result.current.answered).toBe(false);
    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.locations).toEqual(LOCATIONS);
    expect(result.current.failure).toBeNull();
  });

  // A reader without locations.view is never asked for them (ADR-080).
  it('asks nothing while inactive', async () => {
    let asked = 0;
    server.use(
      http.get('/api/v1/locations', () => {
        asked += 1;
        return HttpResponse.json(LOCATIONS);
      }),
    );
    const { result } = renderHook(() => useLocations(false));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(asked).toBe(0);
    expect(result.current.answered).toBe(false);
    expect(result.current.locations).toEqual([]);
  });

  it('says why the read failed, and reads again when asked', async () => {
    server.use(
      http.get('/api/v1/locations', () => apiError(500, 'Down'), {
        once: true,
      }),
    );
    const { result } = renderHook(() => useLocations(true));

    await waitFor(() => expect(result.current.answered).toBe(true));
    expect(result.current.failure).not.toBeNull();
    expect(result.current.locations).toEqual([]);

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.failure).toBeNull());
    expect(result.current.locations).toEqual(LOCATIONS);
  });
});
