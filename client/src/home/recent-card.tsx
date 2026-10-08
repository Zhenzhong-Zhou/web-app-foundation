import { Box, Button, Link, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { api } from '../lib/api';
import { RECENT_PATHS, type RecentEntry } from '../lib/recent';
import {
  RECENT_KIND_LABELS,
  recentTitle,
  recentWhen,
} from '../lib/recent-labels';

/** How many Home shows (ADR-058). */
const ON_HOME = 6;

/**
 * Recently opened, on Home (ADR-058): the last six records this person
 * opened, as tiles, with Clear. Not a to-do, so not counted with the cards;
 * and left out while empty, the one card that hides, since an empty history
 * is not work done.
 */
export function RecentCard() {
  const intl = useIntl();
  const [entries, setEntries] = useState<RecentEntry[]>([]);

  useEffect(() => {
    let ignore = false;
    api<{ recent: RecentEntry[] }>(`/recent?limit=${ON_HOME}`)
      .then((response) => {
        if (!ignore) setEntries(response.recent);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  async function clear() {
    await api('/recent', { method: 'DELETE' }).catch(() => undefined);
    setEntries([]);
  }

  if (entries.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="recent-title"
      sx={{ p: 2.5 }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'baseline',
          mb: 1.25,
        }}
      >
        <Typography variant="h6" component="h2" id="recent-title">
          {intl.formatMessage({
            id: 'recent.title',
            defaultMessage: 'Recently opened',
          })}
        </Typography>
        <Button variant="text" onClick={() => void clear()}>
          {intl.formatMessage({ id: 'recent.clear', defaultMessage: 'Clear' })}
        </Button>
      </Stack>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 1.25,
        }}
      >
        {entries.map((entry) => (
          <Box
            component="li"
            key={`${entry.kind}:${entry.id}`}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              px: 1.5,
              py: 1.25,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.25,
              minWidth: 0,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              {intl.formatMessage(RECENT_KIND_LABELS[entry.kind])}
            </Typography>
            <Link
              component={RouterLink}
              to={RECENT_PATHS[entry.kind](entry.id)}
              sx={{ fontWeight: 600 }}
              noWrap
            >
              {recentTitle(intl, entry)}
            </Link>
            <Typography variant="body2" color="text.secondary" noWrap>
              {entry.detail
                ? intl.formatMessage(
                    {
                      id: 'recent.detailWhen',
                      defaultMessage: '{detail} · {when}',
                    },
                    {
                      detail: entry.detail,
                      when: recentWhen(intl, entry.openedAt),
                    },
                  )
                : recentWhen(intl, entry.openedAt)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}
