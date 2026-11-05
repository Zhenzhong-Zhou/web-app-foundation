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
 * What is late in a kind (ADR-091): its tile's pill ("2 late"), its button
 * in the panel of what is late ("2 orders to ship"), and the list that
 * button opens, just the late ones, by the filter the server counts them
 * with.
 */
interface Late {
  pill: MessageDescriptor;
  button: MessageDescriptor;
  list: string;
}

/**
 * What each Home tile is (ADR-058; ADR-091): its name, icon, the list it
 * opens (filtered and sorted as the server counted it, in the address),
 * what it says when there is nothing to do, and what is late in it.
 */
interface CardMeta {
  title: MessageDescriptor;
  empty: MessageDescriptor;
  icon: SvgIconComponent;
  /** The tile's list: exactly what the tile counted, the late first. */
  list: string;
  late?: Late;
}

/** A tile's name, the plainer one its list shares (ADR-091). */
const TITLES = defineMessages<HomeKind>({
  toShip: { id: 'home.card.toShip', defaultMessage: 'To ship' },
  toReceive: { id: 'home.card.toReceive', defaultMessage: 'To receive' },
  expiring: { id: 'home.card.expiring', defaultMessage: 'Expiring soon' },
  costsWaiting: {
    id: 'home.card.costsWaiting',
    defaultMessage: 'Waiting for a cost',
  },
  invoicesToIssue: {
    id: 'home.card.invoicesToIssue',
    defaultMessage: 'Invoices to issue',
  },
  returnsOpen: { id: 'home.card.returnsOpen', defaultMessage: 'Open returns' },
  production: { id: 'home.card.production', defaultMessage: 'In production' },
  licences: { id: 'home.card.licences', defaultMessage: 'Licences expiring' },
  lowStock: { id: 'home.card.lowStock', defaultMessage: 'Low stock' },
});

/** A quiet tile's words, under its name: a label, so no full stop. */
const EMPTY = defineMessages<HomeKind>({
  toShip: { id: 'home.empty.toShip', defaultMessage: 'No orders to ship' },
  toReceive: {
    id: 'home.empty.toReceive',
    defaultMessage: 'No orders to receive',
  },
  expiring: {
    id: 'home.empty.expiring',
    defaultMessage: 'No lots expiring in {days} days',
  },
  costsWaiting: {
    id: 'home.empty.costsWaiting',
    defaultMessage: 'Every receipt has a cost',
  },
  invoicesToIssue: {
    id: 'home.empty.invoicesToIssue',
    defaultMessage: 'No invoices to issue',
  },
  returnsOpen: {
    id: 'home.empty.returnsOpen',
    defaultMessage: 'No returns open',
  },
  production: {
    id: 'home.empty.production',
    defaultMessage: 'No runs in production',
  },
  licences: {
    id: 'home.empty.licences',
    defaultMessage: 'None expiring in 60 days',
  },
  lowStock: { id: 'home.empty.lowStock', defaultMessage: 'Nothing low' },
});

const PILLS = defineMessages({
  late: {
    id: 'home.count.late',
    defaultMessage: '{count, plural, other {# late}}',
  },
  expiredLots: {
    id: 'home.count.expired',
    defaultMessage: '{count, plural, other {# expired}}',
  },
  expiredLicences: {
    id: 'home.count.expiredLicences',
    defaultMessage: '{count, plural, other {# expired}}',
  },
  out: {
    id: 'home.count.out',
    defaultMessage: '{count, plural, other {# out}}',
  },
});

/** The number in bold, as the panel draws it: `<b>2</b> orders to ship`. */
const BUTTONS = defineMessages({
  toShip: {
    id: 'home.late.toShip',
    defaultMessage:
      '{count, plural, one {<b>#</b> order to ship} other {<b>#</b> orders to ship}}',
  },
  toReceive: {
    id: 'home.late.toReceive',
    defaultMessage:
      '{count, plural, one {<b>#</b> order to receive} other {<b>#</b> orders to receive}}',
  },
  lowStock: {
    id: 'home.late.lowStock',
    defaultMessage:
      '{count, plural, one {<b>#</b> item out of stock} other {<b>#</b> items out of stock}}',
  },
  expiring: {
    id: 'home.late.expiring',
    defaultMessage:
      '{count, plural, one {<b>#</b> expired lot} other {<b>#</b> expired lots}}',
  },
  licences: {
    id: 'home.late.licences',
    defaultMessage:
      '{count, plural, one {<b>#</b> expired licence} other {<b>#</b> expired licences}}',
  },
});

export const CARDS: Record<HomeKind, CardMeta> = {
  toShip: {
    title: TITLES.toShip,
    empty: EMPTY.toShip,
    icon: LocalShippingOutlined,
    // Still to ship, which only a confirmed order can be; Orders runs it
    // soonest first, the late leading (ADR-091).
    list: '/orders?direction=sale&outstanding=1',
    late: {
      pill: PILLS.late,
      button: BUTTONS.toShip,
      list: '/orders?direction=sale&outstanding=1&late=1',
    },
  },
  toReceive: {
    title: TITLES.toReceive,
    empty: EMPTY.toReceive,
    icon: MoveToInboxOutlined,
    list: '/orders?direction=purchase&outstanding=1',
    late: {
      pill: PILLS.late,
      button: BUTTONS.toReceive,
      list: '/orders?direction=purchase&outstanding=1&late=1',
    },
  },
  // After To receive on the page, as the server orders it (ADR-085).
  lowStock: {
    title: TITLES.lowStock,
    empty: EMPTY.lowStock,
    icon: Inventory2Outlined,
    list: '/inventory?tab=reorder-points&status=low',
    // Out: nothing usable and nothing coming (ADR-085).
    late: {
      pill: PILLS.out,
      button: BUTTONS.lowStock,
      list: '/inventory?tab=reorder-points&status=out',
    },
  },
  expiring: {
    title: TITLES.expiring,
    empty: EMPTY.expiring,
    icon: HourglassBottomOutlined,
    // By expiry, the soonest first, whenever the filter is on (ADR-091).
    list: '/inventory?expiring=1',
    late: {
      pill: PILLS.expiredLots,
      button: BUTTONS.expiring,
      list: '/inventory?expiring=1&expired=1',
    },
  },
  costsWaiting: {
    title: TITLES.costsWaiting,
    empty: EMPTY.costsWaiting,
    icon: PaidOutlined,
    // Stock value's Waiting for a cost, the rows the server counts, where
    // a cost is set (ADR-091).
    list: '/costs',
  },
  invoicesToIssue: {
    title: TITLES.invoicesToIssue,
    empty: EMPTY.invoicesToIssue,
    icon: DescriptionOutlined,
    list: '/invoices?status=draft',
  },
  returnsOpen: {
    title: TITLES.returnsOpen,
    empty: EMPTY.returnsOpen,
    icon: AssignmentReturnOutlined,
    list: '/return-authorizations?status=open',
  },
  production: {
    title: TITLES.production,
    empty: EMPTY.production,
    icon: PrecisionManufacturingOutlined,
    list: '/production?status=released',
  },
  licences: {
    title: TITLES.licences,
    empty: EMPTY.licences,
    icon: VerifiedOutlined,
    // Expiring soon, the expired among them, soonest first (ADR-091, #460).
    list: '/licences?expiring=1',
    late: {
      pill: PILLS.expiredLicences,
      button: BUTTONS.licences,
      list: '/licences?expiring=1&expired=1',
    },
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
