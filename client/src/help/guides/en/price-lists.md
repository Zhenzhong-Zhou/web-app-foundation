# Price lists

A price list holds a price per item, for sales to customers or for purchases from suppliers. An order line added without a price takes one from its partner’s list, and keeps it: changing a list never changes an order already written.

## Create a price list {#add}

1. Press **New price list**.
2. Give it a **Name**, as people will pick it: Wholesale CAD, Cascade USD.
3. Choose its side, **What customers pay** or **What a supplier charges**, and its currency. Neither can change later.
4. Press **Create**.

## Add prices {#prices}

1. Open the list and press **Add a price**.
2. Choose the item and type its unit price, before tax.
3. Press **Save price**.

On an item’s row, **Change** and **Remove** correct the list. A change prices lines added from then on; orders already priced keep their price.

> Only someone who may create price lists sees **New price list**, and only someone who may change them sees **Add a price**, **Change**, **Remove** and **Edit**.

## Give a partner a list {#partner}

1. Open the partner on [Partners](/partners).
2. Choose its list under **Sales to them**, **Purchases from them**, or both.
3. Press **Save price lists**.

> Only someone who may change partners sees **Save price lists**.

A customer with no list of their own takes the **Default sale price list**, set on the organization’s **Money** tab. A purchase has no default: a supplier’s prices are its own.

## Retire a list {#retire}

Open the list, press **Edit**, untick **In use**, and press **Save**. A retired list prices no new lines and cannot be given to a partner; a customer who had it takes the default. Orders it priced keep their prices.

## Words you’ll meet {#words}

- **Sale** and **Purchase**: the list’s side, for customers or for suppliers.
- **Retired**: kept, but pricing no new lines.

## If something is refused {#refused}

- A price list with that name already exists. Choose another name.
- A retired list cannot be given to a partner. Choose one in use, or put it back in use.
- On an order, **Use list price** is refused when the list has no price for the item. Add one here, or type the price on the line.

See also [Orders](/orders) and [Partners](/partners).
