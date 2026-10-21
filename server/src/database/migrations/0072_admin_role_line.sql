-- Hand-written: the Admin's line says invite, not add, as What you can do
-- here does (ADR-079), where a system Admin still holds the line 0068 gave
-- it; a line an organization wrote stays theirs. The screens and the email
-- read the translated line by the role's name; this keeps the export's
-- roles.csv saying the same.
UPDATE "roles"
SET "description" = 'Day-to-day work: stock, orders, production and drafting invoices. Can invite and remove members.'
WHERE "is_system"
  AND "name" = 'Admin'
  AND "description" = 'Day-to-day work: stock, orders, production and drafting invoices. Can add and remove members.';
