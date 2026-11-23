# Orders

An order is what you buy from a supplier or sell to a customer. A purchase brings stock in; a sale sends it out.

> An order shows no prices, totals or PDFs to someone whose roles don’t include **See prices on orders**: to see them, ask someone who may change roles.

## Raise an order {#raise}

1. Press **Raise an order**.
2. Choose **Selling** or **Buying**, then the partner. From Reorder, it is **Buying** already.
3. Add each item and its quantity. A price can wait: left blank, the partner’s price list supplies it when there is one.
4. Press **Raise as draft**. Nothing moves yet, and you can still change anything.
5. Once the partner agrees, press **Confirm**.

A confirmed sale holds the stock it needs, so nobody promises the same units twice.

> Only someone who may raise orders sees **Raise an order**, and only someone who may change them sees **Confirm**, **Close order** and **Cancel order**.

## Receive a purchase {#receive}

1. Open the confirmed purchase.
2. On the item’s line, choose **Receive**.
3. Choose where it goes and how much came. For an item tracked by lot, type the lot number as printed on the box, or press **Make a code for us** when it shows none, and for a new lot choose when it **Expires**, as Inventory’s **Receive stock** does.

If the rest of a line is never coming, choose **Close short** on the line: the shortfall stays in sight.

Beside its status, a confirmed order says how much has come: **Not received**, **Partly received** or **All received**, and on a sale **Not shipped**, **Partly shipped** or **All shipped**. A line closed short counts as done, though an order whose every line was closed short with nothing in reads **Not received**, and more than was ordered still reads **All received**. The label is worked out from the lines, so nobody sets it, and the list’s **Receiving** filter (**Shipping** on a sales list, **Receiving or shipping** on both) narrows it to one of them, kept in the address.

On a purchase, **Receipts** lists each delivery with its lot and who received it, and ends with **All movements of** the order’s number, which opens [Movements](/movements) for it; a sale’s **Shipments** ends the same way. Whoever may see the order sees Receipts, where it went only if they may see locations; the link only if they may see stock.

## Ship a sale {#ship}

1. Open the confirmed sale and press **Ship**.
2. Choose where it ships from, and how much of each item. Lots are taken earliest expiry first, or **Choose lots** to pick them yourself. A lot whose expiry has not been entered still ships, with an amber line naming it: its expiry reads **Expiry to add**, and the packing slip shows none until it is added.
3. Add the carrier and tracking number if you have them, and press **Ship**.

Everything listed ships together, or nothing does: set a line to 0 to leave it for later. The packing slip and the invoice start from the shipment, on **Shipments**.

> Only someone who may receive goods sees **Receive**, and only someone who may ship sees **Ship**. To do either, ask someone who may change roles.

## Finish an order {#finish}

When nothing more is coming, press **Close order**, whether everything arrived or not. Once everything is in, the order asks “Everything has arrived. Close the order?” (on a sale, “Everything has shipped. Close the order?”; where a line was closed short, “Nothing more is expected. Close the order?”), and **Close order** closes it. **Cancel order** is offered only until something has moved.

## What a link chose {#chips}

Home’s tiles and its late buttons open Orders with the list already narrowed or ordered. Each choice shows as a chip above the list: press its × to remove it, and the list widens again.

- **Sales only** or **Purchases only**: one direction.
- **Draft** or **Confirmed**: one status.
- **Still to ship**, **Still to receive**, or **Still to ship or receive**: confirmed orders with something left to move, the soonest expected first, until you sort by a column.
- **Late**: of those, the ones expected before today.
- **Oldest first**: the orders made first at the top, as Home’s **Orders · Draft** opens them, so a draft forgotten longest is seen first. Remove it, and the newest are first again.

## Words you’ll meet {#words}

- **Draft**: written, not yet agreed.
- **Confirmed**: agreed with the partner. Its label says how much has come, as above.
- **Received** or **Shipped**: closed. The list’s filter calls both **Fulfilled**.
- **Cancelled**: called off before anything moved.
- **Closed short**: a line that expects no more, its shortfall kept.
- **Late**: confirmed, with something still to ship or receive, and expected before today.

## If something is refused {#refused}

- A sale is confirmed only once every item has a price. Zero is a price.
- An order that goods have moved against cannot be cancelled. Close it instead.
- An item cannot be added to a confirmed order. Raise a new order for it.
- A line cannot change once goods are received against it. Close it short, and raise a new order for anything more.

See also [Invoices](/invoices) and [Partners](/partners).
