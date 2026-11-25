CREATE TABLE "lot_former_codes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"code" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by" uuid NOT NULL,
	"reason" text NOT NULL,
	CONSTRAINT "lot_former_codes_code_not_blank_check" CHECK (length(btrim("lot_former_codes"."code")) > 0),
	CONSTRAINT "lot_former_codes_reason_not_blank_check" CHECK (length(btrim("lot_former_codes"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "lot_former_codes" ADD CONSTRAINT "lot_former_codes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_former_codes" ADD CONSTRAINT "lot_former_codes_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_former_codes" ADD CONSTRAINT "lot_former_codes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lot_former_codes_code_trgm_idx" ON "lot_former_codes" USING gin ("organization_id","code" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "lot_former_codes_lot_idx" ON "lot_former_codes" USING btree ("lot_id","changed_at");--> statement-breakpoint
-- Hand-written (ADR-094's amendment, R12, #669's 78): one start lot a
-- code, the lot noted tracking_started, until now held by the code alone
-- (start-lot.ts). Before the index, stop naming each code that has two,
-- rather than let the index fail on the first pair it meets, by ids.
DO $$
DECLARE
  twice text;
BEGIN
  SELECT string_agg(
           format('%s (organization %s, %s start lots)', v.sku, s.organization_id, s.n),
           '; ' ORDER BY v.sku, s.organization_id)
    INTO twice
    FROM (
      SELECT organization_id, variant_id, count(*) AS n
        FROM lots
       WHERE note = 'tracking_started'
       GROUP BY organization_id, variant_id
      HAVING count(*) > 1
    ) AS s
    JOIN product_variants AS v
      ON v.organization_id = s.organization_id AND v.id = s.variant_id;
  IF twice IS NOT NULL THEN
    RAISE EXCEPTION 'More than one start lot for a code: %', twice
      USING HINT = 'Keep the note tracking_started on one lot of each code, then run the migrations again.';
  END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "lots_org_variant_start_lot_key" ON "lots" USING btree ("organization_id","variant_id") WHERE "lots"."note" = 'tracking_started';
