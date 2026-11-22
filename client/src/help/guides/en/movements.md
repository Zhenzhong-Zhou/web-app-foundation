# Movements

Movements are every change to a quantity, newest first: receipts, shipments, transfers, corrections, production and returns. They are never edited or removed; a mistake is corrected by another movement.

## Find a movement {#find}

1. Type in **Find an item, lot or order**, a code, a name or a number, and choose from what it offers, grouped as Items, Lots and Orders, “Lot VC-0302 · Vitamin C 500 mg · expires Nov 22, 2026” or “PO-000009 · Lakeshore Packaging · Partly received”. A lot is found by its code or its supplier’s lot, which its option names. What matches exactly comes alone, a whole lot code such as MCS-001, or a whole supplier’s lot, just that lot; only when nothing does, what comes close, for a typo, under **Close matches**. An item reads that code’s movements, a lot its item’s with that lot alone, and an order what moved on it. Arrows move, Enter chooses, Escape closes. What you type alone filters nothing; each choice is a chip above the list. Leave it empty to read every movement.
2. Narrow the list by **Location**, by **Reason**, and by the days under **When**, one menu: **Today**, **This week**, **This month**, **Last 30 days**, **Last month** or **This year**, each with its days beside it, a period that holds today ending today and a week starting on Monday; or **Choose dates…**, which opens **From** and **To**, typed or picked, with **Clear** and **Apply**, for a day to start, a day to end, or both. Both days are included, in your organization’s days; leave From empty for from the start, To empty for until today. **When** and a chip above the list show the days chosen, as “1 – 20 Nov 2026”, the year once when it is one, From alone as “From 1 Nov 2026” and To alone as “Until 15 Nov 2026”; days nothing moved in say so, with **Show all movements**; **Any time**, at the menu’s foot, or the chip’s ×, takes them off. Escape closes the menu.
3. Press **Show 25 more** to see older rows. If the next 25 cannot be loaded, the rows stay, with **Try again**.

Press **When** at the head of the first column to put the oldest first, and again for the newest. Every filter is in the address, so a reload, a link and Back keep them; **Show all movements** takes every one off.

Each row says when; the item’s name, with its code and type under it, and “was VITC-90” where the code has changed since; the change, with its unit; the reason; from → to, each place by its path, an end outside the warehouse said in grey as supplier, customer, run, sample, counted in or counted out; the lot with its expiry; what it was for, a link to the order or run, or to the partner a sample went to; and who did it. Below 600 px each movement is a card, and the filters and the sort are behind one **Filters** button.

## Read one code like a stock card {#card}

With one item chosen, **In** and **Out** replace the change, and **Balance** says what was on hand after each row, worked back from today’s on hand.

- Across every place, a move between two of the code’s places is neither In nor Out, so the balance holds: its row says how many moved once, across both, in grey, as in “moved 20 each, counted in neither”, and the period’s In and Out leave it out. With several items, the change reads “moved 20 each”. With a **Location** chosen, the figures count that place alone, and a line says so; with a lot chosen, that lot alone, and with a place too, that lot there.
- With days chosen, a line above the list gives the opening balance, **In**, **Out** and the closing balance for them: the closing is the opening plus In less Out, and for days that end today, or run past it, it is today’s on hand, dated today. Several items have no such line, since their units differ.
- With a **Reason** chosen, **Balance** goes, since it counts every reason: “Balance counts every reason. Clear Reason to see it.” In and Out stay.
- With several items listed at a place, a line asks you to choose one item to see In, Out and Balance. An order’s movements show In and Out, never Balance, so with an order chosen there is no such line.

## Where a link leads {#links}

Movements opens already narrowed from other screens, and **Back** returns to where you were, as you left it.

- On [Inventory](/inventory), an item’s **Actions** › **Movements** opens that code, a place’s **Movements** that code at that place, and a lot’s **Actions** › **Movements** that lot over its whole life, with no dates, as **All movements of this lot** on its trace does.
- On an item’s page, each code under **Where it stands** has its **Latest movements**, the five newest, ending with **All movements of** the code, which opens on this month, its opening balance, In, Out and closing balance above the list.
- A purchase’s **Receipts** and a sale’s **Shipments** end with **All movements of** the order’s number.

Every filter that is set shows as a chip above the list, on a phone too: the item, marked “(discontinued)” when it is no longer used, the location, the reason, the days, and a lot or an order a link names, as “Lot: VC-0302” or “Order: PO-000009”; press a chip’s × to remove that filter alone, as from a lot’s movements down to its shelf’s. An order’s movements are what was received, shipped and returned on it.

## Export the list {#export}

Press **Export** to download the movements your filters show as a CSV file, for a spreadsheet. It has the screen’s columns, one value in each, oldest first, then the code a movement was recorded under where it has changed since, a Reason code column after Reason with the reason’s code, such as receipt or shipment, the same in every language so exports in two languages can be put together, the email of whoever did it, and the note last. Beside Lot, Supplier’s lot gives the supplier’s own lot of a code made here, or Supplier’s lot to add until it is given, and Expiry reads Expiry to add where the expiry is not known yet. **When** gives the day and the time on your organization’s clock, the day written year-month-day, and its header names the place, as in When (Vancouver time). With one item chosen, a Moved column between Out and Balance gives how many a move counted in neither moved; with days chosen too, its first row is the opening balance and its last the closing balance, beside the period’s In and Out.

## Correct a mistake {#correct}

A movement cannot be changed. To put a quantity right, use **Correct the count** or **Move** on [Inventory](/inventory). Each adds a movement of its own, so the history says what happened and who did it.

> Someone who may not see locations has no **Location** list and no **From → to** column, and a link that names a place reads **Everywhere**; their export has no From or To. Someone who may not see orders sees no order in **For**, nor a run without permission to see production, nor a sample’s partner without permission to see partners, and a link that names an order lists every movement, with no chip. Someone who may not see stock does not see Movements at all.

## Words you’ll meet {#words}

- **Received**: stock arriving, on an order or without one.
- **Shipped**: stock leaving, for a customer or with no order.
- **Moved**: stock taken from one location to another.
- **Corrected**: a count put right, or stock found where it had never been, its cause after a colon, as in “Corrected: found”.
- **Made** and **Used in a run**: what a run made, and what it used.
- **Sampled**: stock given away.
- **Returned**: stock a customer sent back.
- **Deleted user**: someone whose account was deleted. Their movements stay.

See also [Inventory](/inventory) and [Trace a lot](/lots).
