import ArrowDropDown from '@mui/icons-material/ArrowDropDown';
import {
  Box,
  Menu,
  MenuItem,
  Skeleton,
  Tab,
  Tabs,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { useState } from 'react';
import { useIntl } from 'react-intl';

import { SelectField } from '../components/select-field';
import { NO_VALUE } from '../lib/format';
import { rem } from '../theme/rem';
import type { ItemTab, TabCount } from './item-list';
import { itemTabLabel } from './product-types';

/** How many tabs a narrow bar shows before More (ADR-092). */
const SHOWN_BEFORE_MORE = 3;

/**
 * The type tabs with their counts (ADR-092). Only the tabs `tabs` names,
 * in its order: a type the organization holds no item of has none. Below
 * `lg` the first three show, with the open one, and the rest go under
 * More with their counts, never into a sideways scroll; on a phone they
 * are one select, "Type: Products (128)".
 *
 * Which width shows which is a hook, not CSS, so a tab hidden under More
 * is not in the bar's keyboard order (MUI's arrows would stop on it).
 */
export function ItemTabs({
  tabs,
  current,
  onChoose,
  count,
}: {
  tabs: readonly ItemTab[];
  current: ItemTab;
  onChoose: (tab: ItemTab) => void;
  count: (tab: ItemTab) => TabCount;
}) {
  const intl = useIntl();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  const narrow = useMediaQuery(theme.breakpoints.down('lg'), { noSsr: true });
  const [more, setMore] = useState<HTMLElement | null>(null);

  const nameOf = (tab: ItemTab) => itemTabLabel(tab, intl);

  /** A count in words, for the select and the More menu. */
  const counted = (tab: ItemTab) => {
    const value = count(tab);
    return intl.formatMessage(
      { id: 'products.tab.counted', defaultMessage: '{name} ({count})' },
      {
        name: nameOf(tab),
        count: typeof value === 'number' ? value : NO_VALUE,
      },
    );
  };

  if (phone) {
    return (
      <SelectField
        id="items-type"
        size="small"
        label={intl.formatMessage({
          id: 'products.typeLabel',
          defaultMessage: 'Type',
        })}
        emptyLabel={counted('all')}
        value={current === 'all' ? '' : current}
        onChange={(event) => onChoose((event.target.value || 'all') as ItemTab)}
        fullWidth
      >
        {tabs
          .filter((tab) => tab !== 'all')
          .map((tab) => (
            <MenuItem key={tab} value={tab}>
              {counted(tab)}
            </MenuItem>
          ))}
      </SelectField>
    );
  }

  const shown = narrow
    ? tabs.filter((tab, index) => index < SHOWN_BEFORE_MORE || tab === current)
    : tabs;
  const under = tabs.filter((tab) => !shown.includes(tab));

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={current}
        onChange={(_, next: ItemTab | 'more') => {
          if (next !== 'more') onChoose(next);
        }}
        aria-label={intl.formatMessage({
          id: 'products.tabs',
          defaultMessage: 'Types',
        })}
      >
        {shown.map((tab) => (
          <Tab
            key={tab}
            value={tab}
            label={<TabLabel name={nameOf(tab)} count={count(tab)} />}
          />
        ))}
        {under.length > 0 && (
          <Tab
            value="more"
            aria-haspopup="menu"
            aria-expanded={more ? 'true' : undefined}
            onClick={(event) => setMore(event.currentTarget)}
            label={
              <Box
                component="span"
                sx={{ display: 'inline-flex', alignItems: 'center' }}
              >
                {intl.formatMessage({
                  id: 'products.tab.more',
                  defaultMessage: 'More',
                })}
                <ArrowDropDown fontSize="small" />
              </Box>
            }
          />
        )}
      </Tabs>
      <Menu anchorEl={more} open={more !== null} onClose={() => setMore(null)}>
        {under.map((tab) => (
          <MenuItem
            key={tab}
            onClick={() => {
              setMore(null);
              onChoose(tab);
            }}
          >
            {counted(tab)}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}

/**
 * A tab's name and its count beside it, grey while it is read. One
 * message, so a screen reader hears two words, "Packaging 22", and a
 * language may order them its own way.
 */
function TabLabel({ name, count }: { name: string; count: TabCount }) {
  const intl = useIntl();

  return (
    <Box component="span">
      {intl.formatMessage(
        { id: 'products.tab.label', defaultMessage: '{name} {count}' },
        {
          name,
          count:
            count === 'loading' ? (
              <Skeleton
                key="count"
                component="span"
                variant="rounded"
                aria-hidden
                sx={{ display: 'inline-block', width: rem(24) }}
              />
            ) : (
              <Box
                key="count"
                component="span"
                sx={{ color: 'text.secondary' }}
              >
                {count === 'failed' ? NO_VALUE : count}
              </Box>
            ),
        },
      )}
    </Box>
  );
}
