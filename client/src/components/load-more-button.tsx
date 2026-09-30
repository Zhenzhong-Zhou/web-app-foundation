import { Box, Button, type SxProps, type Theme } from '@mui/material';

/**
 * The foot of a keyset list: Load more, and "Loading…" while a page is on
 * its way. Nothing at all once the server says there is no more.
 *
 * Load more rather than page numbers. A keyset cursor has no notion of
 * "page 4", and offset paging repeats rows as new ones arrive at the head —
 * which on the movement lists is constantly (ADR-018).
 *
 * Centred under the list wherever it sits. Nine lists wrote this button out
 * and had drifted to three placements — centred, left, and stretched full
 * width by a column Stack — for one control.
 */
export function LoadMoreButton({
  hasMore,
  loading,
  onLoadMore,
  sx,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => Promise<void> | void;
  /** Spacing from what sits above it, where the list needs some. */
  sx?: SxProps<Theme>;
}) {
  if (!hasMore) return null;

  return (
    <Box
      sx={[
        { display: 'flex', justifyContent: 'center' },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Button
        variant="text"
        onClick={() => void onLoadMore()}
        disabled={loading}
      >
        {loading ? 'Loading…' : 'Load more'}
      </Button>
    </Box>
  );
}
