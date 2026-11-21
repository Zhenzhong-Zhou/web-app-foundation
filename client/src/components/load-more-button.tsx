import {
  Button,
  Stack,
  type SxProps,
  type Theme,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

/**
 * The foot of a keyset list: Load more, and "Loading…" while a page is on
 * its way. Once the server says there is no more, the button goes, and
 * `before` stays alone, so a list that counts its rows says so always
 * (#638): "31 codes" (`ShowingLine`).
 *
 * Load more rather than page numbers. A keyset cursor has no notion of
 * "page 4", and offset paging repeats rows as new ones arrive at the head —
 * which on the movement lists is constantly (ADR-018).
 *
 * Centred under the list wherever it sits. Nine lists wrote this button out
 * and had drifted to three placements — centred, left, and stretched full
 * width by a column Stack — for one control.
 *
 * With `pageSize`, it says how many it shows, "Show 50 more"; with
 * `failed`, the next page could not be read: the rows above stay, and
 * the line beside it says so, with Try again (#544), Items' first.
 * `before` sits ahead of it on the same line, as Items' "Showing 50 of
 * 120 items".
 */
export function LoadMoreButton({
  hasMore,
  loading,
  onLoadMore,
  sx,
  failed = false,
  pageSize,
  before,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => Promise<void> | void;
  /** Spacing from what sits above it, where the list needs some. */
  sx?: SxProps<Theme>;
  /** The last Load more could not be read. */
  failed?: boolean;
  /** How many a page holds, for "Show 50 more". */
  pageSize?: number;
  before?: ReactNode;
}) {
  const intl = useIntl();

  const more = hasMore || failed;
  if (!more && !before) return null;

  return (
    <Stack
      direction="row"
      useFlexGap
      sx={[
        {
          flexWrap: 'wrap',
          gap: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {before}
      {failed && (
        <Typography variant="body2" sx={{ color: 'error.main' }}>
          {intl.formatMessage(
            {
              id: 'components.loadMore.failed',
              defaultMessage:
                '{count, select, 0 {The next page could not be loaded.} other {The next {count} could not be loaded.}}',
            },
            { count: pageSize ?? 0 },
          )}
        </Typography>
      )}
      {more && (
        <Button
          variant="text"
          onClick={() => void onLoadMore()}
          disabled={loading}
        >
          {loading
            ? intl.formatMessage({
                id: 'common.loading',
                defaultMessage: 'Loading…',
              })
            : failed
              ? intl.formatMessage({
                  id: 'common.tryAgain',
                  defaultMessage: 'Try again',
                })
              : pageSize
                ? intl.formatMessage(
                    {
                      id: 'components.loadMore.count',
                      defaultMessage: 'Show {count} more',
                    },
                    { count: pageSize },
                  )
                : intl.formatMessage({
                    id: 'components.loadMore',
                    defaultMessage: 'Load more',
                  })}
        </Button>
      )}
    </Stack>
  );
}
