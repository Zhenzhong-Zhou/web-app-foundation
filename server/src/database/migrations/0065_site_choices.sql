ALTER TABLE "orders" ADD COLUMN "deliver_to_id" uuid;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD COLUMN "send_back_to_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliver_to_id_locations_id_fk" FOREIGN KEY ("deliver_to_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_send_back_to_id_locations_id_fk" FOREIGN KEY ("send_back_to_id") REFERENCES "public"."locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_deliver_to_id_idx" ON "orders" USING btree ("deliver_to_id") WHERE "orders"."deliver_to_id" is not null;--> statement-breakpoint
CREATE INDEX "return_authorizations_send_back_to_id_idx" ON "return_authorizations" USING btree ("send_back_to_id") WHERE "return_authorizations"."send_back_to_id" is not null;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliver_to_is_purchase_check" CHECK ("orders"."deliver_to_id" is null or "orders"."direction" = 'purchase');--> statement-breakpoint
ALTER TABLE "return_authorizations" ADD CONSTRAINT "return_authorizations_send_back_to_needs_goods_check" CHECK ("return_authorizations"."send_back_to_id" is null or "return_authorizations"."expects_goods");--> statement-breakpoint
-- Hand-written (ADR-071, amended): existing orders and RMAs choose as new
-- ones do. A purchase goes to the organization's one active site, when it
-- has exactly one; with several, nobody chose, and it prints the
-- registered address as before.
UPDATE "orders" AS o
SET "deliver_to_id" = s."id"
FROM (
  SELECT "organization_id", (array_agg("id"))[1] AS "id"
  FROM "locations"
  WHERE "type" = 'site' AND "is_active"
  GROUP BY "organization_id"
  HAVING count(*) = 1
) AS s
WHERE o."organization_id" = s."organization_id"
  AND o."direction" = 'purchase';--> statement-breakpoint
-- An RMA expecting goods: the nearest site at or above where its order's
-- latest standing shipment left from, when that site is still active.
WITH RECURSIVE "latest" AS (
  SELECT DISTINCT ON (r."id") r."id" AS "rma_id", s."from_location_id"
  FROM "return_authorizations" AS r
  JOIN "shipments" AS s
    ON s."order_id" = r."order_id" AND s."voided_at" IS NULL
  WHERE r."expects_goods"
  ORDER BY r."id", s."created_at" DESC, s."id" DESC
),
"up" ("rma_id", "id", "parent_id", "type", "is_active", "depth") AS (
  SELECT lt."rma_id", l."id", l."parent_id", l."type", l."is_active", 0
  FROM "latest" AS lt
  JOIN "locations" AS l ON l."id" = lt."from_location_id"
  UNION ALL
  SELECT up."rma_id", p."id", p."parent_id", p."type", p."is_active",
    up."depth" + 1
  FROM "up"
  JOIN "locations" AS p ON p."id" = up."parent_id"
  WHERE up."type" <> 'site' AND up."depth" < 10
)
UPDATE "return_authorizations" AS r
SET "send_back_to_id" = site."id"
FROM (
  SELECT DISTINCT ON ("rma_id") "rma_id", "id", "is_active"
  FROM "up"
  WHERE "type" = 'site'
  ORDER BY "rma_id", "depth"
) AS site
WHERE r."id" = site."rma_id" AND site."is_active";--> statement-breakpoint
-- Otherwise, as for a purchase: the one active site, when there is one.
UPDATE "return_authorizations" AS r
SET "send_back_to_id" = s."id"
FROM (
  SELECT "organization_id", (array_agg("id"))[1] AS "id"
  FROM "locations"
  WHERE "type" = 'site' AND "is_active"
  GROUP BY "organization_id"
  HAVING count(*) = 1
) AS s
WHERE r."organization_id" = s."organization_id"
  AND r."expects_goods"
  AND r."send_back_to_id" IS NULL;
