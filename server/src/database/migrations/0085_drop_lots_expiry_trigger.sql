-- Hand-written (ADR-094's amendment, R3): 0084's temporary trigger, for the
-- release that wrote expires_at alone, goes with its function. Every
-- released write to lots now names both expiry and expires_at, so the
-- check lots_expiry_date_check alone holds the kind to the day, and a write
-- that contradicts it is refused rather than mended.
DROP TRIGGER lots_expiry_from_date ON lots;
--> statement-breakpoint
-- No release calls the function: only the trigger above did.
-- squawk-ignore ban-drop-function
DROP FUNCTION lots_expiry_from_date();
