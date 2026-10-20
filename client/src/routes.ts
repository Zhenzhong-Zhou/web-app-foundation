import type { ComponentType } from 'react';

import {
  AccountPage,
  AuditPage,
  CreateOrderPage,
  CreditNoteDetailPage,
  CreditNotesPage,
  ExchangeRatesPage,
  HomePage,
  InventoryPage,
  InvoiceDetailPage,
  InvoicesPage,
  LicencesPage,
  LocationsPage,
  LotSearchPage,
  LotTracePage,
  MembersPage,
  MovementsPage,
  OrderDetailPage,
  OrdersPage,
  OrganizationPage,
  PartnerDetailPage,
  PartnersPage,
  PeoplePage,
  PersonPage,
  PriceListDetailPage,
  PriceListsPage,
  ProductDetailPage,
  ProductionOrderDetailPage,
  ProductionOrdersPage,
  ProductsPage,
  RmaDetailPage,
  RmasPage,
  SessionsPage,
  StockValuePage,
  TaxCodesPage,
  YourActivityPage,
} from './pages';

export interface SignedInRoute {
  /** As the router matches it: `/orders/:id`. */
  path: string;
  page: ComponentType;
}

/**
 * Every page behind the app layout, which App.tsx renders as its routes.
 * One list, so Help's check (help/guides.test.ts) reads the routes the
 * router does, and a page added here without a guide fails a test rather
 * than opening Help on nothing (ADR-079).
 */
export const SIGNED_IN_ROUTES: SignedInRoute[] = [
  { path: '/', page: HomePage },
  { path: '/account', page: AccountPage },
  { path: '/account/sessions', page: SessionsPage },
  { path: '/account/activity', page: YourActivityPage },
  { path: '/people', page: PeoplePage },
  { path: '/people/:userId', page: PersonPage },
  { path: '/members', page: MembersPage },
  { path: '/audit', page: AuditPage },
  { path: '/settings/organization', page: OrganizationPage },
  { path: '/settings/tax-codes', page: TaxCodesPage },
  { path: '/settings/exchange-rates', page: ExchangeRatesPage },
  { path: '/settings/price-lists', page: PriceListsPage },
  { path: '/settings/price-lists/:id', page: PriceListDetailPage },
  { path: '/costs', page: StockValuePage },
  { path: '/products', page: ProductsPage },
  { path: '/products/:id', page: ProductDetailPage },
  { path: '/licences', page: LicencesPage },
  { path: '/inventory', page: InventoryPage },
  { path: '/movements', page: MovementsPage },
  { path: '/lots', page: LotSearchPage },
  { path: '/lots/:id', page: LotTracePage },
  { path: '/locations', page: LocationsPage },
  { path: '/partners', page: PartnersPage },
  { path: '/partners/:id', page: PartnerDetailPage },
  { path: '/orders', page: OrdersPage },
  { path: '/orders/new', page: CreateOrderPage },
  { path: '/orders/:id', page: OrderDetailPage },
  { path: '/invoices', page: InvoicesPage },
  { path: '/invoices/:id', page: InvoiceDetailPage },
  { path: '/credit-notes', page: CreditNotesPage },
  { path: '/credit-notes/:id', page: CreditNoteDetailPage },
  { path: '/return-authorizations', page: RmasPage },
  { path: '/return-authorizations/:id', page: RmaDetailPage },
  { path: '/production', page: ProductionOrdersPage },
  { path: '/production/:id', page: ProductionOrderDetailPage },
];
