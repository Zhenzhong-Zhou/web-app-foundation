# Invoices

An invoice bills one shipment, and is created from it on the order. Once issued it never changes: a mistake is voided with a credit note and invoiced again. A credit note gives back part or all of an invoice, and is issued from it.

## Create and issue an invoice {#issue}

1. Open the sale on [Orders](/orders), and on **Shipments** press **Create invoice** on the shipment. A **Draft invoice** opens.
2. Choose a **Tax code for every line** and press **Apply to every line**, or **Edit** a line to set its own price and tax code.
3. Add a **Due date** and a **Note on the invoice** if you want them, and press **Save details**.
4. Press **Issue**, check the **Invoice date**, and press **Issue** again. The invoice takes its number and can no longer be edited.

A draft nobody outside has seen can be removed with **Delete draft**, and the shipment invoiced again.

> Only someone who may create invoices sees **Create invoice**, and only someone who may issue invoices sees **Issue**, **Credit** and **Void**.

## Credit part of an invoice {#credit}

1. Open the issued invoice and press **Credit**.
2. Enter what is credited on each line. The price can be lowered, for a restocking fee or goodwill, but never raised.
3. Give a **Reason**, which the customer reads on the credit note, and press **Issue credit note**.

For an invoice that will never be paid, **Credit everything — uncollectable** fills in every line in full, with that reason. Every credit note is listed on **Credit notes**.

## Void an invoice {#void}

Press **Void**, give a **Reason** and press **Void invoice**. A credit note reverses the invoice in full, both stay on record, and the shipment can be invoiced again. Once part of an invoice is credited, credit what remains instead.

## Words you’ll meet {#words}

- **Draft**: not yet sent, with no number. It can still change.
- **Issued**: numbered and sent. It never changes.
- **Voided**: reversed in full by a credit note.

## If something is refused {#refused}

- Issuing needs the organization’s registered address, and its tax number when the invoice charges tax: set them on [Organization](/settings/organization#profile).
- Issuing needs the customer’s billing address: add one on their page in [Partners](/partners).
- Every line needs a tax code. Add codes on [Tax codes](/settings/tax-codes).
- A shipment that already has an invoice is not billed twice. Void that invoice first.
- Samples are not invoiced: nobody pays for them.

See also [Returns](/return-authorizations).
