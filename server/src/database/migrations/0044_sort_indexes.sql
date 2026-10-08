CREATE INDEX "credit_notes_org_credit_date_id_idx" ON "credit_notes" USING btree ("organization_id","credit_date","id");--> statement-breakpoint
CREATE INDEX "credit_notes_org_total_id_idx" ON "credit_notes" USING btree ("organization_id","total","id");--> statement-breakpoint
CREATE INDEX "invoices_org_invoice_date_id_idx" ON "invoices" USING btree ("organization_id","invoice_date","id");--> statement-breakpoint
CREATE INDEX "invoices_org_total_id_idx" ON "invoices" USING btree ("organization_id","total","id");--> statement-breakpoint
CREATE INDEX "orders_org_expected_at_id_idx" ON "orders" USING btree ("organization_id","expected_at","id");