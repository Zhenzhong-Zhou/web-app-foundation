import type { SvgIconComponent } from '@mui/icons-material';
import AssignmentReturnOutlined from '@mui/icons-material/AssignmentReturnOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import HourglassBottomOutlined from '@mui/icons-material/HourglassBottomOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import MoveToInboxOutlined from '@mui/icons-material/MoveToInboxOutlined';
import PaidOutlined from '@mui/icons-material/PaidOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import VerifiedOutlined from '@mui/icons-material/VerifiedOutlined';
import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { HomeKind } from '../lib/types';

/**
 * What each Home card is (ADR-058): its name, icon, the list its "See all"
 * opens (filtered as the server counted it), where a row opens, and what
 * it says when there is nothing to do.
 */
interface CardMeta {
  title: MessageDescriptor;
  empty: MessageDescriptor;
  icon: SvgIconComponent;
  /** "See all": the list, filtered to exactly the card's rows. */
  list: string;
  /** A row's page, or null when its list is where it is dealt with. */
  rowPath: (id: string) => string | null;
  /** Whether "late" means expired (stock, licences) or overdue. */
  lateIsExpired: boolean;
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
});

export const CARDS: Record<HomeKind, CardMeta> = {
  toShip: {
    title: TITLES.toShip,
    empty: EMPTY.toShip,
    icon: LocalShippingOutlined,
    list: '/orders?direction=sale&status=confirmed',
    rowPath: (id) => `/orders/${id}`,
    lateIsExpired: false,
  },
  toReceive: {
    title: TITLES.toReceive,
    empty: EMPTY.toReceive,
    icon: MoveToInboxOutlined,
    list: '/orders?direction=purchase&status=confirmed',
    rowPath: (id) => `/orders/${id}`,
    lateIsExpired: false,
  },
  expiring: {
    title: TITLES.expiring,
    empty: EMPTY.expiring,
    icon: HourglassBottomOutlined,
    list: '/inventory?expiring=1',
    rowPath: (id) => `/lots/${id}`,
    lateIsExpired: true,
  },
  costsWaiting: {
    title: TITLES.costsWaiting,
    empty: EMPTY.costsWaiting,
    icon: PaidOutlined,
    list: '/inventory?needsCost=1',
    rowPath: () => null,
    lateIsExpired: false,
  },
  invoicesToIssue: {
    title: TITLES.invoicesToIssue,
    empty: EMPTY.invoicesToIssue,
    icon: DescriptionOutlined,
    list: '/invoices?status=draft',
    rowPath: (id) => `/invoices/${id}`,
    lateIsExpired: false,
  },
  returnsOpen: {
    title: TITLES.returnsOpen,
    empty: EMPTY.returnsOpen,
    icon: AssignmentReturnOutlined,
    list: '/return-authorizations?status=open',
    rowPath: (id) => `/return-authorizations/${id}`,
    lateIsExpired: false,
  },
  production: {
    title: TITLES.production,
    empty: EMPTY.production,
    icon: PrecisionManufacturingOutlined,
    list: '/production?status=released',
    rowPath: (id) => `/production/${id}`,
    lateIsExpired: false,
  },
  licences: {
    title: TITLES.licences,
    empty: EMPTY.licences,
    icon: VerifiedOutlined,
    list: '/licences',
    rowPath: () => '/licences',
    lateIsExpired: true,
  },
};

/** Whole days from `today` to `day`, both calendar days: negative is past. */
export function daysUntil(day: string, today: string): number {
  return Math.round((Date.parse(day) - Date.parse(today)) / 86_400_000);
}
