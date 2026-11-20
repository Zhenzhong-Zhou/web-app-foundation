# Inventory

Inventory shows what you have and where: a row for each code, opening to the places it is in and the lots at each. From here you receive stock that came without an order, move it, and correct a count. Its second tab, **Reorder**, says which items run short, and buys or makes them.

## Read the stock {#stock}

On **Stock**, each row is a code, the code on a variant’s label, so an item that comes in three sizes has three rows. It lists every code with stock on hand, wanted by a confirmed sale, coming, or watched by a reorder point; **Show emptied** adds the rest. It reads fifty rows at a time, and **Show 50 more** adds the next fifty.

- The name first, its code under it in grey, and its type. Press the name, or the row, to open the item’s page.
- **Where**: how many places hold it, such as “2 places”. Press it to open the places, and a place’s lots to open them: the lots that expire first on top, the expired above them, a lot with no expiry last. A lot’s code opens its trace.
- **On hand**: every unit at every place, usable or not. What is not usable is said under it, such as “12 not usable”: expired, issued to a run, or at a place not available.
- **Free**: what you can still promise, usable stock less what is held, never below 0. What confirmed orders want beyond it is said under it, such as “20 short”; press it to see the orders waiting.
- **Held**: kept for confirmed sales, the earliest confirmed first.
- **Coming**: what confirmed purchases and released runs still have to bring, with the soonest day.
- **Status**: **Low**, **Out** or **Enough**, with “10 left · reorder at 36” under it for a code with a reorder point. Press the line to see where the code stands.
- **Expires first**: the soonest expiry of the usable stock, or “all expired” where every unit on hand has expired; “—” where nothing expires.
- **Actions**: the row’s actions, below.

Below 600 px each code is a card with **On hand** and **Free**, saying under them why Free is less, such as “12 not usable: expired” and “30 held”, and **Filters** holds what the screen has no room for. From 600 to 899 px **Held** and **Coming** leave the table.

> Someone who may not see locations reads “3 lots” in place of the places, opens the lots alone, and has no **Location** list.

## Find stock {#find}

- The quick filters, on a row of their own above the search (on a phone, in **Filters**), show only what they name, each with its count: **Low stock** (the out ones too), **Out**, **Expiring soon** (the expired ones too), **Expired** and **Waiting for a cost**. A count is the rows the filter shows, with the other filters on, so press one and the list is that long.
- **Type**, **Category** and **Location** narrow the list, and **Search items, codes or lots** finds a code, an item’s name or a lot’s code. A message says when nothing matches, with **Show all stock**.
- Press **On hand** or **Expires first** at the head of a column to sort by it, and again to reverse; the name is the default. A code with nothing to expire comes last either way. Free is not a sort.
- Choose a place under **Location** and the list shows what is there: **On hand here**, **Lots here** and **Expires first here** are that place’s, while **Free, every place** and **Held, every place** count every place, since a sale holds an item, not a shelf. A lot’s code searched with a place chosen finds that lot at that place only.
- Every filter, the group and the sort are in the address, so a reload and Back keep them. **Export** writes the rows the list shows, with its filters, in the screen’s words and your language.

## Group by lot {#lots}

Choosing **Lot** under **Group by** turns the list into one row for each lot at each place: the lot that expires first on top, the expired above it, a lot’s places together, and each saying “1 of 2 places” so its rows read as one lot. Press **Item**, **Location** or **Quantity** at the head of a column to sort by it instead, again to reverse it; **Expires** puts it back. Its filters are **Low stock**, **Expiring soon**, **Expired** and **Waiting for a cost**; there is no **Out**, since an item that is out has no lots, and choosing it says “Items that are out have no lots.” with **Group by Item** to go back.

Home’s **Expiring soon** opens this view, soonest first, the expired on top, and counts these rows.

## Receive stock {#receive}

1. Press **Receive stock**.
2. Choose the item. When it is still to come on a purchase, Inventory first asks **Which delivery is this?**, listing each order with what is still to come and when: choose its order, and press **Continue**; that order’s own **Receive** opens with what is still to come filled in. Choose **Not on an order** for stock that came without one, and carry on here.
3. Choose the location it goes **Into**. Only locations that hold stock directly are listed.
4. Type the quantity, in the item’s unit.
5. For an item tracked by lot, type the lot number and expiry as printed on the box. Receiving the same lot again adds to it.
6. Press **Receive**.

Goods a supplier sends against a purchase are received on its order, so the order closes and the stock is counted once: here by choosing it, or on [Orders](/orders). Stock received here has no cost until one is set on [Stock value](/costs); **Waiting for a cost** lists it.

## Move, ship or correct {#move}

Each row has **Actions**, by what the row is:

- An item’s row: **Move…**, **Ship out…**, **Send sample…** and **Correct the count…**; **Receive stock…**, with the item filled in; **Movements** and **Change reorder point…**. When the item is one lot at one place, the first four act on it straight. With more, the menu says a lot comes next, and the row opens to its lots under “Choose the lot to move”, each lot with its own Actions. With nothing on hand, Move, Ship out and Send sample are greyed, with why beneath; Correct the count opens its emptied places and lots; an item never stocked there says to receive it first.
- A place’s row: its **Movements** there, a link.
- A lot’s row: **Move…**, **Ship out…**, **Send sample…** and **Correct the count…**; **Edit lot details…** and **Trace lot**; **Movements**. An emptied lot says when it was emptied.

What each does:

- **Move…**: to another location, such as from the dock to a shelf.
- **Ship out…**: stock that leaves with no order. A customer’s goods ship from their sale on Orders.
- **Send sample…**: a hand-out, with whom it was given to, so a recall can find it.
- **Correct the count…**: how many more or fewer the shelf has than recorded, why, and what happened.
- **Count it in…**, ending an item’s opened places and lots under “Found some where it has never been?”: stock found at a place, or in a lot, the item has never had. Choose the location and, for an item tracked by lot, **One of its lots** or **A new lot**, its number as printed on the box and one the item does not have yet. A new lot, or an item with no cost yet, waits for a cost on [Stock value](/costs).
- **Edit lot details…**, **Trace lot** and **Movements**: the lot, where it went, and its movements.
- **Change reorder point…**: the item’s reorder point, below.

> Everyone who may see stock sees **Movements** and **Trace lot**. Only someone who may move stock sees **Receive stock** and what changes stock, and only someone who may correct counts sees **Correct the count…** and **Count it in…**.

## What each count counts {#counts}

A number on a filter or a tile counts one kind of thing, and the kind is the same wherever you meet it.

- **Stock**, by item, counts codes: a **Low stock** count of 4 is four codes, wherever they sit.
- **Stock**, by lot, counts lots at each place: a lot in two places is two rows and counts twice.
- **Reorder**, and Home’s **Low stock**, count codes, so an item with three codes under their points counts three.
- Home’s **Expiring soon** counts lots at each place, the rows of the Lot view.
- **Items** counts items: its **Low stock** counts an item once, however many of its codes are low, and its badge says “Low · 1 of 3 codes”. See [Items](/items#rows).

## Reorder points {#reorder-points}

A reorder point is the level below which an item is running short: below it, the item shows as low here, on Home and in the bell, with what to order. An item with no point is never low.

1. On **Reorder**, press **Add reorder point**, or choose **Change reorder point…** in an item’s **Actions** on **Stock**.
2. Choose the item, and whether it is **Bought** or **Made**. Made is chosen for you when the item has an active recipe.
3. Type the **Reorder point**, in the item’s unit, and choose how much to order.
4. **Today** shows where the item stands now and after the suggested order. Press **Add reorder point**, or **Save** when editing.

Each row’s actions offer **Edit reorder point**, **Stock of the item** and **Remove reorder point**, which changes neither its stock nor its orders. A discontinued item keeps its point and is never low.

> Everyone who may see stock sees the list. Only someone who may set reorder points sees **Add reorder point**, **Change reorder point…** and each row’s actions: at first the Owner alone, until a role gives it.

## Where an item stands {#position}

What an item has **Left** = usable + coming − still needed: stock at locations marked available, less expired lots and what was issued to runs; plus confirmed purchase orders and released runs still to come; less confirmed sales still to ship. So a purchase order already raised does not raise another. Said in a line it is “10 left · reorder at 36”, and a press on it opens the item’s page at [Where it stands](/items#stands), which lists what makes each figure up.

An item is **Low** below its point, **Out** at zero or less, and **Enough** otherwise. The list opens with the most to order first; press **Status** to put the furthest below their point first instead, or on a phone choose **Low first** under **Sort**. **Low stock** shows the out ones too. Open a row to see what makes up what is left, late orders marked; on a phone, where each item is a card, press the line saying how many are left, which opens the item’s stock.

## How much to order {#how-much}

- **Just enough**: the shortfall, back to the point.
- **A fixed quantity**: in whole multiples, as a supplier sells in cases. Short by 1,500, with 1,000 at a time, it suggests 2 × 1,000.
- **Up to a maximum**: fills it to a level above the point.

Draft purchase orders and runs show as **In draft**. They are not counted as coming, since a draft may never be sent, but they are taken off the **Suggested order**. A low item its drafts cover reads **In a draft already** beside its box, so nobody orders it twice.

## Order or make what is low {#order}

- **Bought**: press **Buy** and its quantity on the row, or tick several rows and press **Buy 2 items on one purchase order** in the bar that appears. A new purchase opens with a line for each at its suggested order. Choose the supplier under **Partner**, check the quantities and prices, and press **Raise as draft**.
- **Made**: **Make** and its quantity on its row opens a run with its active recipe, the suggested order and what it uses.

Nothing is saved until you create it, and what you create shows on the row at once. When an item falls below its point, the next hourly check tells whoever can act on it in the bell, once until it recovers: those who may raise orders for a bought item, those who may plan runs for a made one.

> Only someone who may raise orders can choose rows, and only someone who may plan runs sees **Make**.

## Words you’ll meet {#words}

- **Held**: kept for a confirmed sale.
- **Free**: stock that can be promised, sampled or used in production.
- **Not available**: a location whose stock is not for sending, such as a bin of returns waiting to be checked.
- **Expiring soon**: a lot that expires within the days your organization has set.
- **Expired**: a lot past its expiry day. As a filter, the list shows only these, the soonest first, until you remove it.

## If something is refused {#refused}

- Stock goes only into a location with nothing inside it. Choose one of the places inside it.
- Nothing is sent from a location marked not available. Move the stock to an available location first.
- Stock held for a confirmed sale cannot be taken for anything else. Ship it on that sale, or take only what is free.
- Expired stock, or stock issued to a run, is on the shelf but holds nothing for anyone. Taking it when another order needs the usable stock is refused, saying how many are expired or issued, with a link to the item’s page, where its places show which.
- A lot code printed on the boxes cannot be renamed. Move the stock to the correct lot instead.
- An item has one reorder point at most. Edit the one it has: the refusal links to it.
- A reorder point and its quantities are above zero, and a maximum is above the point.

See also [Movements](/movements), [Trace a lot](/lots#trace), [Orders](/orders#raise) and [Production](/production#plan).
