import { lazyNamed } from './lib/lazy-named';

/**
 * Every page behind the app layout, split into its own chunk.
 *
 * Here rather than in App.tsx so that file stays about routing and guards.
 * The list is also the answer to "what does a signed-in user download" —
 * nothing on it is in the initial bundle.
 *
 * Deliberately absent: the auth pages and AppLayout. They are the first paint
 * for an unauthenticated visitor and the shell for everyone else, so splitting
 * them trades a bundle saving for a round trip on the one screen where nothing
 * is cached yet. App.tsx imports those directly.
 */
export const AccountPage = lazyNamed(
  () => import('./account/account-page'),
  'AccountPage',
);

export const SessionsPage = lazyNamed(
  () => import('./account/sessions-page'),
  'SessionsPage',
);

export const AuditPage = lazyNamed(
  () => import('./audit/audit-page'),
  'AuditPage',
);

export const MembersPage = lazyNamed(
  () => import('./members/members-page'),
  'MembersPage',
);

export const ProductsPage = lazyNamed(
  () => import('./products/products-page'),
  'ProductsPage',
);

export const ProductDetailPage = lazyNamed(
  () => import('./products/product-detail-page'),
  'ProductDetailPage',
);

export const LicencesPage = lazyNamed(
  () => import('./licences/licences-page'),
  'LicencesPage',
);

export const InventoryPage = lazyNamed(
  () => import('./inventory/inventory-page'),
  'InventoryPage',
);

export const MovementsPage = lazyNamed(
  () => import('./inventory/movements-page'),
  'MovementsPage',
);

export const LotSearchPage = lazyNamed(
  () => import('./inventory/lot-trace-page'),
  'LotSearchPage',
);

export const LotTracePage = lazyNamed(
  () => import('./inventory/lot-trace-page'),
  'LotTracePage',
);

export const LocationsPage = lazyNamed(
  () => import('./locations/locations-page'),
  'LocationsPage',
);

export const PartnersPage = lazyNamed(
  () => import('./partners/partners-page'),
  'PartnersPage',
);

export const PartnerDetailPage = lazyNamed(
  () => import('./partners/partner-detail-page'),
  'PartnerDetailPage',
);

export const OrdersPage = lazyNamed(
  () => import('./orders/orders-page'),
  'OrdersPage',
);

export const CreateOrderPage = lazyNamed(
  () => import('./orders/create-order-page'),
  'CreateOrderPage',
);

export const OrderDetailPage = lazyNamed(
  () => import('./orders/order-detail-page'),
  'OrderDetailPage',
);

export const PackingSlipPage = lazyNamed(
  () => import('./orders/packing-slip-page'),
  'PackingSlipPage',
);

export const ProductionOrdersPage = lazyNamed(
  () => import('./production/production-orders-page'),
  'ProductionOrdersPage',
);

export const ProductionOrderDetailPage = lazyNamed(
  () => import('./production/production-order-detail-page'),
  'ProductionOrderDetailPage',
);
