# Inventory

Inventory shows what you have and where: each item, at each location, by lot. From here you receive stock that came without an order, move it, and correct a count. Its second tab, **Reorder points**, says which items run short.

## Receive stock {#receive}

1. Press **Receive stock**.
2. Choose the item, and the location it goes **Into**. Only locations that hold stock directly are listed.
3. Type the quantity, in the item’s unit.
4. For a product tracked by lot, type the lot number and expiry as printed on the box. Receiving the same lot again adds to it.
5. Press **Receive**.

Goods a supplier sends against a purchase are received on the order instead, on [Orders](/orders). Stock received here has no cost until one is set on [Stock value](/costs); **Needs a cost** lists it.

## Move, ship or correct {#move}

Each row’s actions offer:

- **Move**: to another location, such as from the dock to a shelf.
- **Ship out**: stock that leaves with no order. A customer’s goods ship from their sale on Orders.
- **Send sample**: a hand-out, with whom it was given to, so a recall can find it.
- **Correct the count**: how many more or fewer the shelf has than recorded, why, and what happened.
- **Edit lot details**, **Trace lot** and **History**: the row’s lot, where it went, and its movements.

> Only someone who may move stock sees **Receive stock** and each row’s actions, and only someone who may correct counts sees **Correct the count**.

## Promised to customers {#promised}

Once a confirmed sale holds stock or waits for it, this table shows each item’s stock on hand where it can be sent from, what is held, what is free and what is backordered. Held stock goes to the earliest confirmed sale first.

## Reorder points {#reorder-points}

A reorder point is the level below which an item is running short: below it, the item shows as low here, on Home and in the bell, with what to order. An item with no point is never low.

1. On **Reorder points**, press **Add reorder point**, or choose **Reorder point…** in a row’s actions on **Stock**.
2. Choose the item, and whether it is **Bought** or **Made**. Made is chosen for you when the item has an active recipe.
3. Type the **Reorder point**, in the item’s unit, and choose how much to order.
4. **Today** shows where the item stands now and after the suggested order. Press **Add reorder point**, or **Save** when editing.

Each row’s actions offer **Edit reorder point**, **Stock of the item** and **Remove reorder point**, which changes neither its stock nor its orders. A discontinued item keeps its point and is never low.

> Everyone who may see stock sees the list. Only someone who may set reorder points sees **Add reorder point**, **Reorder point…** and each row’s actions: at first the Owner alone, until a role gives it.

## Where an item stands {#position}

An item’s **Position** = usable + coming − still needed: stock at locations marked available, less expired lots and what was issued to runs; plus confirmed purchase orders and released runs still to come; less confirmed sales still to ship. So a purchase order already raised does not raise another.

An item is **Low** below its point, **Out** at zero or less, and **Enough** otherwise. The furthest below their point come first, and **Low** shows the out ones too. Open a row to see what makes up its position, late orders marked.

## How much to order {#how-much}

- **Just enough**: the shortfall, back to the point.
- **A fixed quantity**: in whole multiples, as a supplier sells in cases. Short by 1,500, with 1,000 at a time, it suggests 2 × 1,000.
- **Up to a maximum**: fills it to a level above the point.

Draft purchase orders and runs show as **In draft**. They are not counted as coming, since a draft may never be sent, but they are taken off the **Suggested order**. A low item its drafts cover reads **Drafted**, so nobody orders it twice.

## Order or make what is low {#order}

- **Bought**: choose the rows, then press **Raise a purchase order** in the bar that appears. A new purchase opens with a line for each at its suggested order. Choose the supplier under **Partner**, check the quantities and prices, and press **Raise as draft**.
- **Made**: **Plan a run** on its row opens a run with its active recipe, the suggested order and what it uses.

Nothing is saved until you create it, and what you create shows on the row at once. When an item falls below its point, the next hourly check tells whoever can act on it in the bell, once until it recovers: those who may raise orders for a bought item, those who may plan runs for a made one.

> Only someone who may raise orders can choose rows, and only someone who may plan runs sees **Plan a run**.

## Words you’ll meet {#words}

- **Held**: kept for a confirmed sale.
- **Free**: stock that can be promised, sampled or used in production.
- **Not available**: a location whose stock is not for sending, such as a bin of returns waiting to be checked.
- **Expiring soon**: a lot that expires within the days your organization has set.

## If something is refused {#refused}

- Stock goes only into a location with nothing inside it. Choose one of the places inside it.
- Nothing is sent from a location marked not available. Move the stock to an available location first.
- Stock held for a confirmed sale cannot be taken for anything else. Ship it on that sale, or take only what is free.
- A lot code printed on the boxes cannot be renamed. Move the stock to the correct lot instead.
- An item has one reorder point at most. Edit the one it has: the refusal links to it.
- A reorder point and its quantities are above zero, and a maximum is above the point.

See also [Movements](/movements), [Lots](/lots#trace), [Orders](/orders#raise) and [Production](/production#plan).
