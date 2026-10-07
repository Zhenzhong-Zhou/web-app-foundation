import type { SvgIconComponent } from '@mui/icons-material';
import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import AssessmentOutlined from '@mui/icons-material/AssessmentOutlined';
import AssignmentReturnOutlined from '@mui/icons-material/AssignmentReturnOutlined';
import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import CategoryOutlined from '@mui/icons-material/CategoryOutlined';
import CurrencyExchangeOutlined from '@mui/icons-material/CurrencyExchangeOutlined';
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import HandshakeOutlined from '@mui/icons-material/HandshakeOutlined';
import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import PercentOutlined from '@mui/icons-material/PercentOutlined';
import PlaceOutlined from '@mui/icons-material/PlaceOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined';
import SellOutlined from '@mui/icons-material/SellOutlined';
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined';
import { defineMessages, type MessageDescriptor } from 'react-intl';

import type { Permission } from '../auth/permissions';

export interface NavItem {
  label: MessageDescriptor;
  to: string;
  icon: SvgIconComponent;
  /** Hidden from anyone without it. The server's guard is the real check. */
  permission?: Permission;
}

export interface NavGroup {
  /** Names the group's landmark; shown as a heading except on the first. */
  label: MessageDescriptor;
  items: NavItem[];
}

/**
 * The ids are older than the rail: `layout.menu.*` were the account menu's
 * entries before ADR-055 moved them here. Kept, so no translation is lost
 * to a rename.
 */
const labels = defineMessages({
  main: { id: 'layout.mainNavigation', defaultMessage: 'Main' },
  records: { id: 'layout.group.records', defaultMessage: 'Records' },
  settings: { id: 'layout.group.settings', defaultMessage: 'Settings' },
  inventory: { id: 'layout.nav.inventory', defaultMessage: 'Inventory' },
  movements: { id: 'layout.nav.movements', defaultMessage: 'Movements' },
  orders: { id: 'layout.nav.orders', defaultMessage: 'Orders' },
  invoices: { id: 'layout.nav.invoices', defaultMessage: 'Invoices' },
  returns: { id: 'layout.nav.returns', defaultMessage: 'Returns' },
  production: { id: 'layout.nav.production', defaultMessage: 'Production' },
  products: { id: 'layout.nav.products', defaultMessage: 'Products' },
  partners: { id: 'layout.nav.partners', defaultMessage: 'Partners' },
  locations: { id: 'layout.nav.locations', defaultMessage: 'Locations' },
  trace: { id: 'layout.nav.trace', defaultMessage: 'Trace a lot' },
  stockValue: { id: 'layout.menu.stockValue', defaultMessage: 'Stock value' },
  auditLog: { id: 'layout.menu.auditLog', defaultMessage: 'Audit log' },
  organization: {
    id: 'layout.menu.organization',
    defaultMessage: 'Organization',
  },
  members: { id: 'layout.menu.members', defaultMessage: 'Members' },
  taxCodes: { id: 'layout.menu.taxCodes', defaultMessage: 'Tax codes' },
  exchangeRates: {
    id: 'layout.menu.exchangeRates',
    defaultMessage: 'Exchange rates',
  },
  priceLists: { id: 'layout.menu.priceLists', defaultMessage: 'Price lists' },
  account: { id: 'layout.menu.account', defaultMessage: 'Account' },
  devices: { id: 'layout.menu.devices', defaultMessage: 'Devices' },
});

/**
 * Every destination, in three groups (ADR-055): the work, in the order it
 * happens; the records that work is done with, and the places to look
 * something up; and the settings, visited when something needs changing.
 *
 * The same groups in the rail and in the drawer, so narrowing the window
 * moves the links and never hides one.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: labels.main,
    items: [
      {
        label: labels.inventory,
        to: '/inventory',
        icon: Inventory2Outlined,
        permission: 'stock.view',
      },
      {
        label: labels.movements,
        to: '/movements',
        icon: SwapHorizOutlined,
        permission: 'stock.view',
      },
      {
        label: labels.orders,
        to: '/orders',
        icon: ReceiptLongOutlined,
        permission: 'orders.view',
      },
      {
        label: labels.invoices,
        to: '/invoices',
        icon: DescriptionOutlined,
        permission: 'invoices.view',
      },
      {
        label: labels.returns,
        to: '/return-authorizations',
        icon: AssignmentReturnOutlined,
        permission: 'return_authorizations.view',
      },
      {
        label: labels.production,
        to: '/production',
        icon: PrecisionManufacturingOutlined,
        permission: 'production.view',
      },
    ],
  },
  {
    label: labels.records,
    items: [
      {
        label: labels.products,
        to: '/products',
        icon: CategoryOutlined,
        permission: 'products.view',
      },
      {
        label: labels.partners,
        to: '/partners',
        icon: HandshakeOutlined,
        permission: 'partners.view',
      },
      {
        label: labels.locations,
        to: '/locations',
        icon: PlaceOutlined,
        permission: 'locations.view',
      },
      // Its own entry rather than a button on Inventory: a recall is the
      // most important search in the app, and it starts from a code.
      {
        label: labels.trace,
        to: '/lots',
        icon: AccountTreeOutlined,
        permission: 'stock.view',
      },
      {
        label: labels.stockValue,
        to: '/costs',
        icon: AssessmentOutlined,
        permission: 'costs.view',
      },
      {
        label: labels.auditLog,
        to: '/audit',
        icon: HistoryOutlined,
        permission: 'audit.view',
      },
    ],
  },
  {
    label: labels.settings,
    items: [
      {
        label: labels.organization,
        to: '/settings/organization',
        icon: BusinessOutlined,
        permission: 'organizations.view',
      },
      { label: labels.members, to: '/members', icon: GroupOutlined },
      {
        label: labels.taxCodes,
        to: '/settings/tax-codes',
        icon: PercentOutlined,
        permission: 'tax_codes.view',
      },
      {
        label: labels.exchangeRates,
        to: '/settings/exchange-rates',
        icon: CurrencyExchangeOutlined,
        permission: 'costs.view',
      },
      {
        label: labels.priceLists,
        to: '/settings/price-lists',
        icon: SellOutlined,
        permission: 'price_lists.view',
      },
    ],
  },
];

/**
 * The person's own things, behind the account button at every width: not
 * places in the organization's work, so not in the rail.
 */
export const ACCOUNT_ITEMS: Pick<NavItem, 'label' | 'to'>[] = [
  { label: labels.account, to: '/account' },
  { label: labels.devices, to: '/account/sessions' },
];

/**
 * Exact or a child path, not a bare prefix: "/products".startsWith would also
 * light up a future "/products-archive", and a highlighted wrong tab is worse
 * than none.
 */
export function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}
