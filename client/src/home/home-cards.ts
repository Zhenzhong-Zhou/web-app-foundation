import type { SvgIconComponent } from '@mui/icons-material';
import AssignmentReturnOutlined from '@mui/icons-material/AssignmentReturnOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import HourglassBottomOutlined from '@mui/icons-material/HourglassBottomOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import MoveToInboxOutlined from '@mui/icons-material/MoveToInboxOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { HomeCard } from '../api/types.gen';
import type { HomeKind } from '../lib/api-names';

/**
 * What each Home card is (ADR-058): its name, icon, the list its "See all"
 * opens (filtered as the server counted it), and what it says when there
 * is nothing to do.
 */
interface CardMeta {
  title: MessageDescriptor;
  empty: MessageDescriptor;
  icon: SvgIconComponent;
  /** "See all": the list, filtered to exactly what the card counted. */
  list: string;
  /**
   * What "late" means: overdue (orders, runs), expired (stock, licences),
   * or out (low stock: nothing usable and nothing coming, ADR-085).
   */
  late: 'overdue' | 'expired' | 'out';
}

const TITLES = defineMessages<HomeKind>({
  toShip: { id: 'home.card.toShip', defaultMessage: 'To ship' },
  toReceive: { id: 'home.card.toReceive', defaultMessage: 'To receive' },
  expiring: { id: 'home.card.expiring', defaultMessage: 'Expiring soon' },
  costsWaiting: {
    id: 'home.card.costsWaiting',
    defaultMessage: 'Costs waiting',
  },
  invoicesToIssue: {
    id: 'home.card.invoicesToIssue',
    defaultMessage: 'Invoices to issue',
  },
  returnsOpen: { id: 'home.card.returnsOpen', defaultMessage: 'Returns open' },
  production: { id: 'home.card.production', defaultMessage: 'In production' },
  licences: { id: 'home.card.licences', defaultMessage: 'Licences' },
  lowStock: { id: 'home.card.lowStock', defaultMessage: 'Low stock' },
});

const EMPTY = defineMessages<HomeKind>({
  toShip: { id: 'home.empty.toShip', defaultMessage: 'Nothing to ship.' },
  toReceive: {
    id: 'home.empty.toReceive',
    defaultMessage: 'Nothing to receive.',
  },
  expiring: {
    id: 'home.empty.expiring',
    defaultMessage: 'Nothing expires within {days} days.',
  },
  costsWaiting: {
    id: 'home.empty.costsWaiting',
    defaultMessage: 'Nothing waiting. Every receipt has a cost.',
  },
  invoicesToIssue: {
    id: 'home.empty.invoicesToIssue',
    defaultMessage: 'No drafts to issue.',
  },
  returnsOpen: {
    id: 'home.empty.returnsOpen',
    defaultMessage: 'No returns open.',
  },
  production: {
    id: 'home.empty.production',
    defaultMessage: 'No runs in progress.',
  },
  licences: {
    id: 'home.empty.licences',
    defaultMessage: 'No licence expires within 60 days.',
  },
  lowStock: {
    id: 'home.empty.lowStock',
    defaultMessage: 'Nothing is low.',
  },
});

export const CARDS: Record<HomeKind, CardMeta> = {
  toShip: {
    title: TITLES.toShip,
    empty: EMPTY.toShip,
    icon: LocalShippingOutlined,
    list: '/orders?direction=sale&status=confirmed&outstanding=1',
    late: 'overdue',
  },
  toReceive: {
    title: TITLES.toReceive,
    empty: EMPTY.toReceive,
    icon: MoveToInboxOutlined,
    list: '/orders?direction=purchase&status=confirmed&outstanding=1',
    late: 'overdue',
  },
  expiring: {
    title: TITLES.expiring,
    empty: EMPTY.expiring,
    icon: HourglassBottomOutlined,
    list: '/inventory?expiring=1',
    late: 'expired',
  },
  costsWaiting: {
    title: TITLES.costsWaiting,
    empty: EMPTY.costsWaiting,
    icon: PaidOutlined,
    // Stock value's Waiting for a cost, the rows the server counts, where
    // a cost is set (ADR-091).
    list: '/costs',
    late: 'overdue',
  },
  invoicesToIssue: {
    title: TITLES.invoicesToIssue,
    empty: EMPTY.invoicesToIssue,
    icon: DescriptionOutlined,
    list: '/invoices?status=draft',
    late: 'overdue',
  },
  returnsOpen: {
    title: TITLES.returnsOpen,
    empty: EMPTY.returnsOpen,
    icon: AssignmentReturnOutlined,
    list: '/return-authorizations?status=open',
    late: 'overdue',
  },
  production: {
    title: TITLES.production,
    empty: EMPTY.production,
    icon: PrecisionManufacturingOutlined,
    list: '/production?status=released',
    late: 'overdue',
  },
  licences: {
    title: TITLES.licences,
    empty: EMPTY.licences,
    icon: VerifiedOutlined,
    list: '/licences',
    late: 'expired',
  },
  // After To receive on the page, as the server orders it (ADR-085).
  lowStock: {
    title: TITLES.lowStock,
    empty: EMPTY.lowStock,
    icon: Inventory2Outlined,
    list: '/inventory?tab=reorder-points&status=low',
    late: 'out',
  },
};

/** A card this build knows how to show. */
export type KnownCard = HomeCard & { kind: HomeKind };

/**
 * Whether this build has a card for it. A server deployed after the tab
 * opened may send a kind the tab has never heard of: Home skips it rather
 * than crash, so a new card reaches an open tab as nothing until it
 * reloads, with no API revision raised for it (ADR-081). oasdiff still
 * reports the new value, which goes in server/openapi-breaking-accepted.txt
 * with this as its reason.
 */
export function isKnownCard(card: HomeCard): card is KnownCard {
  return Object.hasOwn(CARDS, card.kind);
}
