# Movements

Movements are every change to a quantity, newest first: receipts, shipments, transfers, corrections, production and returns. They are never edited or removed; a mistake is corrected by another movement.

## Find a movement {#find}

1. Choose an item under **Item** to read one code’s movements, or leave it to read them all.
2. Narrow the list by **Location**, by **Reason**, and by the days under **When**: a day to start, a day to end, or a **Period** such as **This month**.
3. Press **Show 25 more** to see older rows. If the next 25 cannot be loaded, the rows stay, with **Try again**.

Press **When** at the head of the first column to put the oldest first, and again for the newest. Every filter is in the address, so a reload, a link and Back keep them; **Show all movements** takes every one off.

Each row says when; the item’s name, with its code and type under it, and “was VITC-90” where the code has changed since; the change, with its unit; the reason; from → to, each place by its path, an end outside the warehouse said in grey as supplier, customer, run, counted in or counted out; the lot with its expiry; what it was for, a link to the order or run; and who did it. Below 600 px each movement is a card, and the filters and the sort are behind one **Filters** button.

## Read one code like a stock card {#card}

With one item chosen, **In** and **Out** replace the change, and **Balance** says what was on hand after each row, worked back from today’s on hand.

- Across every place, a move between two of the code’s places is neither In nor Out, so the balance holds. With a **Location** chosen, the figures count that place alone, and a line says so; with a lot chosen, that lot alone, and with a place too, that lot there.
- With days chosen, a line above the list gives the opening balance, **In**, **Out** and the closing balance for them: the closing is the opening plus In less Out, and for days that end today it is today’s on hand. Several items have no such line, since their units differ.
- With a **Reason** chosen, **Balance** goes, since it counts every reason: “Balance counts every reason. Clear Reason to see it.” In and Out stay.
- With several items listed and a place or an order chosen, a line asks you to choose one item to see In, Out and Balance.

## Where a link leads {#links}

Movements opens already narrowed from other screens, and **Back** returns to where you were, as you left it.

- On [Inventory](/inventory), an item’s **Actions** › **Movements** opens that code, a place’s **Movements** that code at that place, and a lot’s **Actions** › **Movements** that lot.
- On an item’s page, each code under **Where it stands** has its **Latest movements**, the five newest, ending with **All movements of** the code.
- A purchase’s **Receipts** and a sale’s **Shipments** end with **All movements of** the order’s number.

A lot or an order a link names shows as a chip above the list, “Lot: VC-0302” or “Order: PO-000009”; press its × to remove it. An order’s movements are what was received, shipped and returned on it.

## Export the list {#export}

Press **Export** to download the movements your filters show as a CSV file, for a spreadsheet. It has the screen’s columns, one value in each, oldest first, then the code a movement was recorded under where it has changed since, the email of whoever did it, and the note last. **When** gives the day and the time on your organization’s clock, the day written year-month-day, and its header names the place, as in When (Vancouver time). With one item and days chosen, its first row is the opening balance and its last the closing balance, beside the period’s In and Out.

## Correct a mistake {#correct}

A movement cannot be changed. To put a quantity right, use **Correct the count** or **Move** on [Inventory](/inventory). Each adds a movement of its own, so the history says what happened and who did it.

> Someone who may not see locations has no **Location** list and no **From → to** column, and a link that names a place reads **Everywhere**; their export has no From or To. Someone who may not see orders sees no order in **For**, nor a run without permission to see production, and a link that names an order lists every movement, with no chip. Someone who may not see stock does not see Movements at all.

## Words you’ll meet {#words}

- **received**: stock arriving, on an order or without one.
- **shipped**: stock leaving, for a customer or with no order.
- **moved**: stock taken from one location to another.
- **corrected**: a count put right, or stock found where it had never been, its cause after a colon, as in “Corrected: found”.
- **made** and **used in a run**: what a run made, and what it used.
- **sampled**: stock given away.
- **returned**: stock a customer sent back.
- **Deleted user**: someone whose account was deleted. Their movements stay.

See also [Inventory](/inventory) and [Trace a lot](/lots).
