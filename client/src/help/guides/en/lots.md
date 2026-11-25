# Trace a lot

A lot is a quantity with its own code and expiry, received from a supplier or made in a production run. Tracing a lot shows where it is, where it came from, what it went into and who received it: the list a recall has to reach.

## Trace a lot {#trace}

1. Open **Trace a lot**.
2. Type any part of the lot code, of the supplier’s lot kept beside a code made here, or of a code the lot had before; the batch number is usually enough. Press Enter.
3. Choose the lot from those listed. Its whole code opens it at once.

You can also find a lot by its code, its supplier’s lot or a code it had before in **Search everything**: its row gives its item’s code, then when it expires or **Expiry to add**, then its supplier’s lot or **Supplier’s lot to add**. Or press a lot’s code wherever one is listed: on Inventory, under **Where it stands** on an item’s page, and under **Waiting for a cost** on Stock value. **Trace lot** on a row of Inventory opens it too. A lot found by a code it had before says so beside its own code, “ASH-0601 · was ASH-06O1”, in **Search everything** and in the list here.

## Read a trace {#read}

Under the lot’s code, its item’s name opens the item’s page, for someone who may see items, and **All movements of this lot** opens Movements on its item with this lot alone, over its whole life, with no dates.

A lot whose code was corrected reads “was ASH-06O1” beside its title, and **Former codes** under it lists each code it had, newest first, with **Used until**, **Changed by** and **Why**. The same grey “was ASH-06O1” stands under the code on Inventory’s lots, on Stock value and, on a row from before the correction, in Movements. A lot never corrected shows none of this.

- **Where it is now**: each location holding some, written by its whole path from its warehouse, and how much. Someone who may not see locations reads how much is **Usable** and **Not usable** instead, with no place named. Where part of the lot was moved into another lot, **Moved on to** lists each such lot, however many moves on, with all it holds now: a recall reaches that stock too.
- **Where it came from**: its receipt and the supplier’s order, or the run that made it and its licence. A receipt with no order says whom it came from, where it was given, and why, such as “Received with no order: opening stock”; stock moved in from another lot names that lot; stock that came back from before lot tracking reads “Back from before lot tracking”; and the lot made when lot tracking started reads “Stock on hand when lot tracking started”.
- **Made from**: the component lots a run used, however many steps back.
- **Went into**: the runs that used it, and the lots they made.
- **Who received it**: every customer this lot, or anything made from it, was shipped or sampled to, and what came back. Part of it moved into another lot is followed there: whoever received that lot is listed too, its **Through lot** naming that lot, which opens its page. Under the lot’s code, a line says how many partners received it; press it to go to the list. On a phone each one is a card. A customer whose goods left before the lot’s code was corrected is a row of its own: **Through lot** reads “shipped as ASH-06O1”, the code that was on the boxes, and one who received it before and after is listed twice, the two rows adding up to what was shipped.

Some may have left with no recipient on record: shipped without an order, or sampled without a name. They are listed with no partner.

Beside **Who received it**, **Export** writes the recall list: the same rows, in your language, each lot’s supplier’s lot beside its code, and “(shipped as ASH-06O1)” after a code that was corrected, with how much was shipped, sampled and returned and the day it first left. Its headings and words are in your language, the day is written year-month-day, and quantities are written plainly, 600 and not 600.0000. On the page, an expiry already past says how long ago: “Expired 4 days ago”.

> Only someone who may see costs sees the lot’s cost and how its value changed. The lot made when lot tracking started holds the item’s earlier cost entries, and a cost carried by a move between lots is listed in both lots, as “Cost carried to lot” and “Cost from lot”.

## Correct a lot’s code {#code}

A code made here can be corrected when it was mistyped, in **Edit lot details…** on the lot’s row in Inventory or beside its title on the lot’s own page. A code printed on the boxes cannot: move the stock to the right lot instead.

1. Change the **Lot number**. **Why is the code changing?** appears under it. It is asked only when the code differs, and a changed code with no reason is not saved.
2. Say why, such as “Typed 0 for O when it was received”.
3. Press **Save**. The message names both codes, “Lot ASH-0601 saved. It was ASH-06O1.”, with **Open the lot**.

The old code is kept under **Former codes**, with the day it stopped being used, who changed it and why, and it finds the lot for as long as the lot is kept: a box still printed with it leads here. The reason is not written in the Activity log, which keeps the two codes alone.

A former code is never given to another lot of the same item, since a box still labelled with it would start a second lot. Type one for a new lot in **Receive stock**, an order’s **Receive**, **Count it in…** or **Move to another lot…**: the **Lot number** turns red as you type, saying which lot had it, with a **Use** button, which takes that lot and keeps what else you typed. **Record output**, in its **Batch number**, and **Edit lot details…** on another lot refuse it with no button. The lot itself may take its old code back, and another item may carry the same code.

## Words you’ll meet {#words}

- **Lot code or supplier’s lot**: the code printed on the box or given here, or the supplier’s own lot kept beside a code made here. Either finds the lot.
- **Former codes**: the codes a lot had before its code was corrected, kept with why. Any of them finds the lot.
- **Steps away**: how many runs lie between this lot and the other.
- **Not available**: a location whose stock is not for sending, such as a bin of returns waiting to be checked.
- **Batch**: what a run makes. It is a lot like any received one.

See also [Inventory](/inventory) and [Production](/production).
