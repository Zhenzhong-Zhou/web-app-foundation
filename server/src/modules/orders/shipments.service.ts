import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import { shipments } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { lotItemsOf, withLotItems } from './lot-items';

/**
 * Reading shipments: an order's list and one shipment's packing slip.
 *
 * Shipping is ShippingService and voiding ShipmentVoidsService; this keeps
 * the reads, as InvoicesService does beside the services that write
 * invoices.
 */
@Injectable()
export class ShipmentsService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * An order's shipments, newest first, each with what it carried by lot.
   * Read from the ledger: the movements are the record, the shipment row is
   * only the header they hang from.
   */
  async listForOrder(orderId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const headers = await tx
        .select()
        .from(shipments)
        .where(
          and(
            eq(shipments.organizationId, organizationId),
            eq(shipments.orderId, orderId),
          ),
        )
        .orderBy(desc(shipments.createdAt));

      return withLotItems(tx, organizationId, headers, {
        referenceType: 'shipment',
        reason: 'shipment',
      });
    });
  }

  /**
   * Everything a packing slip prints, in one read: the shipment and what it
   * carried, the order's reference and customer, where it was going, and who
   * sent it.
   *
   * The address is the order's snapshot, not the partner's address as it is
   * today (ADR-035's neighbour, migration 0012): a slip reprinted next year
   * must show where the box actually went. The item names are joined from the
   * catalogue, which is right for a slip — it is read by a person unpacking a
   * box, not kept as a record — while the SKU beside them is the snapshot.
   */
  async slip(orderId: string, shipmentId: string) {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [row] = (
        await tx.execute(sql`
          select
            s.id,
            s.created_at,
            s.carrier,
            s.tracking_number,
            s.note,
            s.voided_at,
            s.void_reason,
            s.language,
            s.second_language,
            o.reference,
            o.direction,
            o.ship_to_label,
            o.ship_to_line1,
            o.ship_to_line2,
            o.ship_to_city,
            o.ship_to_region,
            o.ship_to_postal_code,
            o.ship_to_country,
            p.name as partner_name,
            org.name as organization_name,
            loc.name as from_location_name
          from shipments s
          join orders o on o.id = s.order_id
          join partners p on p.id = o.partner_id
          join organizations org on org.id = s.organization_id
          join locations loc on loc.id = s.from_location_id
          where s.organization_id = ${organizationId}::uuid
            and s.order_id = ${orderId}::uuid
            and s.id = ${shipmentId}::uuid
        `)
      ).rows as {
        id: string;
        created_at: Date;
        carrier: string | null;
        tracking_number: string | null;
        note: string | null;
        voided_at: Date | null;
        void_reason: string | null;
        language: Locale;
        second_language: Locale | null;
        reference: string | null;
        direction: string;
        ship_to_label: string | null;
        ship_to_line1: string | null;
        ship_to_line2: string | null;
        ship_to_city: string | null;
        ship_to_region: string | null;
        ship_to_postal_code: string | null;
        ship_to_country: string | null;
        partner_name: string;
        organization_name: string;
        from_location_name: string;
      }[];

      if (!row)
        throw new NotFoundException(
          t({
            id: 'orders.suchShipmentOrder',
            defaultMessage: 'No such shipment on this order',
          }),
        );

      const items = await lotItemsOf(tx, organizationId, {
        referenceType: 'shipment',
        reason: 'shipment',
        ids: [shipmentId],
      });

      return {
        id: row.id,
        createdAt: row.created_at,
        carrier: row.carrier,
        trackingNumber: row.tracking_number,
        note: row.note,
        // A voided slip still prints, marked as such, so a copy found in a
        // drawer later cannot pass for goods that left.
        voidedAt: row.voided_at,
        voidReason: row.void_reason,
        // What the slip prints in, fixed when it shipped (ADR-054).
        language: row.language,
        secondLanguage: row.second_language,
        fromLocationName: row.from_location_name,
        organizationName: row.organization_name,
        order: {
          id: orderId,
          reference: row.reference,
          partnerName: row.partner_name,
        },
        // Null when the order was raised without a destination: a slip then
        // prints the customer's name alone rather than an empty address box.
        shipTo: row.ship_to_line1
          ? {
              label: row.ship_to_label,
              line1: row.ship_to_line1,
              line2: row.ship_to_line2,
              city: row.ship_to_city,
              region: row.ship_to_region,
              postalCode: row.ship_to_postal_code,
              country: row.ship_to_country,
            }
          : null,
        items: items.get(shipmentId) ?? [],
      };
    });
  }
}
