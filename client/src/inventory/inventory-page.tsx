import { Box, Tab, Tabs } from '@mui/material';
import { defineMessages, useIntl } from 'react-intl';

import { useTab } from '../lib/use-tab';
import { ReorderPointsTab } from './reorder-points-tab';
import { StockTab } from './stock-tab';

/** Inventory's two views (ADR-085): what is where, and what runs short. */
const INVENTORY_TABS = ['stock', 'reorder'] as const;
type InventoryTab = (typeof INVENTORY_TABS)[number];

/** Reorder was Reorder points (ADR-093): an address kept from then opens it. */
const RENAMED = { 'reorder-points': 'reorder' } as const;

const TAB_LABEL = defineMessages<InventoryTab>({
  stock: { id: 'inventory.tab.stock', defaultMessage: 'Stock' },
  reorder: { id: 'inventory.tab.reorder', defaultMessage: 'Reorder' },
});

/**
 * Inventory: Stock, and Reorder beside it (ADR-085, ADR-093), the open one
 * in the address as `?tab=` (useTab). Each tab draws the page's header
 * with its own actions, then the tabs, then its list; only the open one
 * is drawn, so the tabs name no panel.
 */
export function InventoryPage() {
  const intl = useIntl();
  const [tab, setTab] = useTab<InventoryTab>(INVENTORY_TABS, {
    renamed: RENAMED,
  });

  const tabs = (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={tab}
        onChange={(_, next: InventoryTab) => setTab(next)}
        aria-label={intl.formatMessage({
          id: 'layout.nav.inventory',
          defaultMessage: 'Inventory',
        })}
        variant="scrollable"
        scrollButtons="auto"
        allowScrollButtonsMobile
      >
        {INVENTORY_TABS.map((id) => (
          <Tab key={id} value={id} label={intl.formatMessage(TAB_LABEL[id])} />
        ))}
      </Tabs>
    </Box>
  );

  return tab === 'stock' ? (
    <StockTab tabs={tabs} />
  ) : (
    <ReorderPointsTab tabs={tabs} />
  );
}
