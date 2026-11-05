import type { SvgIconComponent } from '@mui/icons-material';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import AssignmentReturnOutlined from '@mui/icons-material/AssignmentReturnOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import {
  Box,
  Button,
  ButtonBase,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { type IntlShape, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { api } from '../lib/api';
import { RECENT_PATHS, type RecentEntry, type RecentKind } from '../lib/recent';
import {
  RECENT_KIND_LABELS,
  recentTitle,
  recentWhen,
} from '../lib/recent-labels';

/** How many Home shows (ADR-058). */
const ON_HOME = 6;

/** Each kind's icon, the menu's for its page (navigation.ts). */
const ICONS: Record<RecentKind, SvgIconComponent> = {
  order: ReceiptLongOutlined,
  invoice: DescriptionOutlined,
  lot: AccountTreeOutlined,
  product: CategoryOutlined,
  partner: HandshakeOutlined,
  run: PrecisionManufacturingOutlined,
  return: AssignmentReturnOutlined,
  priceList: SellOutlined,
};

/** The kinds whose title is their number and whose detail is a partner. */
const NUMBERED: ReadonlySet<RecentKind> = new Set([
  'order',
  'invoice',
  'return',
]);

/**
 * A row's two lines, the name before the code (the design language's
 * principle 1): an order, an invoice or a return by its partner, its
 * number after; anything else by its own title, its detail after. The
 * kind ends the second line.
 */
function linesOf(
  intl: IntlShape,
  entry: RecentEntry,
): { name: string; detail: string } {
  const kind = intl.formatMessage(RECENT_KIND_LABELS[entry.kind]);
  const withKind = (code: string | null) =>
    code
      ? intl.formatMessage(
          { id: 'recent.codeKind', defaultMessage: '{code} · {kind}' },
          { code, kind },
        )
      : kind;
  if (NUMBERED.has(entry.kind) && entry.detail) {
    // A draft invoice has no number yet: what it is, in its place.
    return {
      name: entry.detail,
      detail: entry.title ? withKind(entry.title) : recentTitle(intl, entry),
    };
  }
  return { name: recentTitle(intl, entry), detail: withKind(entry.detail) };
}

/**
 * Recently opened, on Home (ADR-058; ADR-091): the last six records this
 * person opened, a row each, the whole row its link, with its kind's icon,
 * its name, its code and kind, and when; with Clear. Not a to-do, so not
 * counted with the tiles; and left out while empty, since an empty history
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
      sx={{ overflow: 'hidden' }}
    >
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'center',
          px: 2,
          pt: 1.5,
          pb: 1,
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
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {entries.map((entry) => {
          const Icon = ICONS[entry.kind];
          const { name, detail } = linesOf(intl, entry);
          return (
            <Box
              component="li"
              key={`${entry.kind}:${entry.id}`}
              sx={{ borderTop: 1, borderColor: 'surface.line' }}
            >
              <ButtonBase
                component={RouterLink}
                to={RECENT_PATHS[entry.kind](entry.id)}
                sx={{
                  width: '100%',
                  minHeight: 60,
                  px: 2,
                  py: 1,
                  gap: 1.5,
                  justifyContent: 'flex-start',
                  textAlign: 'start',
                  '@media (hover: hover)': {
                    '&:hover': { bgcolor: 'action.hover' },
                  },
                }}
              >
                <Box
                  aria-hidden
                  sx={{
                    width: 36,
                    height: 36,
                    flex: 'none',
                    borderRadius: '50%',
                    bgcolor: 'tone.neutral.bg',
                    color: 'tone.neutral.fg',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography noWrap sx={{ fontWeight: 600 }}>
                    {name}
                  </Typography>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{ color: 'text.secondary' }}
                  >
                    {detail}
                  </Typography>
                </Box>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                >
                  {recentWhen(intl, entry.openedAt)}
                </Typography>
              </ButtonBase>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
