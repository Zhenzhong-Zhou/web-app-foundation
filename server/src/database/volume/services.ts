import type { INestApplicationContext } from '@nestjs/common';

import { OrganizationsService } from '../../core/organizations/organizations.service';
import { BomsService } from '../../modules/boms/boms.service';
import { ExchangeRatesService } from '../../modules/costs/exchange-rates.service';
import { CreditNotesService } from '../../modules/invoices/credit-notes.service';
import { InvoiceDraftsService } from '../../modules/invoices/invoice-drafts.service';
import { InvoiceIssuingService } from '../../modules/invoices/invoice-issuing.service';
import { LocationsService } from '../../modules/locations/locations.service';
import { OrderLifecycleService } from '../../modules/orders/order-lifecycle.service';
import { OrderReceiptsService } from '../../modules/orders/order-receipts.service';
import { ReturnsService } from '../../modules/orders/returns.service';
import { ShippingService } from '../../modules/orders/shipping.service';
import { PartnerAddressesService } from '../../modules/partners/partner-addresses.service';
import { PartnersService } from '../../modules/partners/partners.service';
import { PriceListsService } from '../../modules/price-lists/price-lists.service';
import { ProductionCloseService } from '../../modules/production-orders/production-close.service';
import { ProductionExecutionService } from '../../modules/production-orders/production-execution.service';
import { ProductionOrdersService } from '../../modules/production-orders/production-orders.service';
import { ProductsService } from '../../modules/products/products.service';
import { ReturnAuthorizationsService } from '../../modules/return-authorizations/return-authorizations.service';
import { StockService } from '../../modules/stock/stock.service';
import { TaxCodesService } from '../../modules/tax-codes/tax-codes.service';

/**
 * Every service the volume seed calls, resolved once.
 *
 * The same ones seed:demo uses, for the same reason: what the seed writes
 * has been through the validation, locking and valuation a request goes
 * through, so stock, the ledger and valuations agree by construction.
 */
export interface Services {
  organization: OrganizationsService;
  products: ProductsService;
  locations: LocationsService;
  partners: PartnersService;
  partnerAddresses: PartnerAddressesService;
  taxCodes: TaxCodesService;
  exchangeRates: ExchangeRatesService;
  priceLists: PriceListsService;
  orders: OrderLifecycleService;
  receipts: OrderReceiptsService;
  shipping: ShippingService;
  returns: ReturnsService;
  stock: StockService;
  boms: BomsService;
  runs: ProductionOrdersService;
  execution: ProductionExecutionService;
  closing: ProductionCloseService;
  invoiceDrafts: InvoiceDraftsService;
  invoiceIssuing: InvoiceIssuingService;
  creditNotes: CreditNotesService;
  rmas: ReturnAuthorizationsService;
}

export function servicesOf(app: INestApplicationContext): Services {
  return {
    organization: app.get(OrganizationsService),
    products: app.get(ProductsService),
    locations: app.get(LocationsService),
    partners: app.get(PartnersService),
    partnerAddresses: app.get(PartnerAddressesService),
    taxCodes: app.get(TaxCodesService),
    exchangeRates: app.get(ExchangeRatesService),
    priceLists: app.get(PriceListsService),
    orders: app.get(OrderLifecycleService),
    receipts: app.get(OrderReceiptsService),
    shipping: app.get(ShippingService),
    returns: app.get(ReturnsService),
    stock: app.get(StockService),
    boms: app.get(BomsService),
    runs: app.get(ProductionOrdersService),
    execution: app.get(ProductionExecutionService),
    closing: app.get(ProductionCloseService),
    invoiceDrafts: app.get(InvoiceDraftsService),
    invoiceIssuing: app.get(InvoiceIssuingService),
    creditNotes: app.get(CreditNotesService),
    rmas: app.get(ReturnAuthorizationsService),
  };
}
