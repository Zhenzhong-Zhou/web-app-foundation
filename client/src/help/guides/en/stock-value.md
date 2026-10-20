# Stock value

What the stock on hand is worth, in the base currency. Each lot carries what it cost; stock without lots carries a running average. Values are material cost only: what was bought, and what went into a batch.

## Give stock its cost {#costs}

Stock that arrived with nothing to value it by is listed under **Waiting for a cost**, and **Why** says what is missing: received with no price, priced in a currency with no rate on file, counted in, or on hand when valuation began. Until it has a cost, the value on hand is **Provisional**.

1. On its row, press **Set cost**.
2. Type the **Unit price**, per unit as the supplier charged it, and its **Currency**.
3. For another currency than the base, type the **Exchange rate**, or leave it blank to use the rate on file for the day it arrived.
4. Press **Set cost**.

A batch made by a run that is still open waits for its run instead: **Open run** goes to it, and the batch takes its cost when the run closes.

> Only someone who may change costs sees **Set cost**.

## Read the value {#read}

The total is **On hand**. **By item and lot** lists each item and lot with its quantity, **Unit cost** and **Value**; a lot’s code opens its trace. **Export** downloads the list as a spreadsheet file.

## Words you’ll meet {#words}

- **Base currency**: what stock is valued in, set on the organization’s **Money** tab.
- **Provisional**: a value that still counts something waiting for a cost.
- **Unit cost**: the value of one unit, the value divided by the quantity.

## If something is refused {#refused}

- No base currency is set, so nothing can be valued. Set one on [Organization](/settings/organization).
- No rate is on file on or before the day it arrived. Enter one on [Exchange rates](/settings/exchange-rates#add), or give the rate with the cost.

See also [Exchange rates](/settings/exchange-rates).
