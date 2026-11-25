# Stock value

What the stock on hand is worth, in the base currency. Each lot carries what it cost; stock without lots carries a running average. Values are material cost only: what was bought, and what went into a batch.

Equipment is left out, here and under **Waiting for a cost**: machines and tools are kept, not sold or used up. [Inventory](/inventory) still shows where each one stands.

## Give stock its cost {#costs}

Stock that arrived with nothing to value it by is listed under **Waiting for a cost**, and **Why** says what is missing: received with no price, priced in a currency with no rate on file, counted in, or on hand when valuation began. Until it has a cost, the value on hand is **Provisional**.

1. On its row, press **Set cost**.
2. Type the **Unit price**, per unit as the supplier charged it, and its **Currency**.
3. For another currency than the base, type the **Exchange rate**, or leave it blank to use the rate on file for the day it arrived.
4. Press **Set cost**.

A cost given to a delivery follows any of it that was moved to another lot, so both lots are valued, and **Set cost** says which lots part of it followed. Stock moved in from a lot that still waits reads “Moved in from lot”, its cost following that lot’s, and offers no **Set cost** of its own.

If part of that delivery has already gone, shipped or used, the cost is shared among its units in proportion: what left takes its share, which the lot’s page lists under **How its value changed** as **Cost of stock already gone**, and what is still held keeps only its own. A return, or a shipment voided, brings back its part of that share.

A return with no cost it shipped at, from a shipment of before costs were kept, or stock received on Inventory as “Returned” with no order, lands at its lot’s average when the lot has stock on hand and none of it waits: its row under **How its value changed** ends “, at the lot’s average”, and **Set cost** may correct it. Otherwise it waits, and takes a cost on its own row as stock received with no price does.

A batch made by a run that is still open waits for its run instead: **Open run** goes to it, and the batch takes its cost when the run closes.

> Only someone who may change costs sees **Set cost**.

## Read the value {#read}

The total is **On hand**, every item’s and lot’s, whatever the list shows. **By item and lot** lists each item and lot with its quantity, **Unit cost** and **Value**, fifty at a time, by the item; a lot’s code opens its trace, and “was ASH-06O1” under it says a code it had before. Under the list, “Showing 50 of 14,512 items and lots” and **Show 50 more**, which adds the next fifty and puts focus on the first new row; if they cannot be loaded the rows stay, with **Try again**. Back from a lot returns to the row you left. **Export** downloads every item and lot as a spreadsheet file.

“Waits for a cost” in place of a **Unit cost** means none of that item’s or lot’s stock has a cost yet, so it is worth nothing for now, and giving it one with **Set cost**, under **Waiting for a cost**, clears it.

Type in **Find an item or a lot** any part of an item’s name or code, or of a lot’s code, its supplier’s lot or a code it had before. The list shows what matches, with “12 of 14,512 match” beside the box, the total as it was, and the find in the address; text that matches nothing says so, with **Clear the search**.

Press **Value**, at the head of its column, to put the largest first, and again for the smallest first. **Item** puts the item’s order back.

## Words you’ll meet {#words}

- **Base currency**: what stock is valued in, set on the organization’s **Money** tab.
- **Provisional**: a value that still counts something waiting for a cost.
- **Unit cost**: the value of one unit, the value divided by the quantity.

## If something is refused {#refused}

- No base currency is set, so nothing can be valued. Set one on [Organization](/settings/organization).
- No rate is on file on or before the day it arrived. Enter one on [Exchange rates](/settings/exchange-rates#add), or give the rate with the cost.

See also [Exchange rates](/settings/exchange-rates).
