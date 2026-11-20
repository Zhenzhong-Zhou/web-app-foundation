# Items

Items are everything your company keeps: what it sells, the raw materials it makes them from, the packaging, the supplies, the samples and the equipment. Each has one or more variants, the things stock is counted in, and each variant has its own **Code**: the code on its label. Other systems call it a SKU.

## The types {#types}

Every item is one of six types. Each type is a tab on Items, with its count, and a type with no items has no tab until it has one.

- **Products**: what you sell to customers.
- **Raw materials**: used up in production.
- **Packaging**: bottles, boxes and labels.
- **Supplies**: used up by the company itself, such as gloves. Your accountant may file them as low-value consumables; Chinese accounts call them 低值易耗品.
- **Samples**: given away, not sold.
- **Equipment**: machines and tools. Equipment is received, moved and counted where it stands, but it is not stock value, because it is an asset, not inventory to sell.

The type can be changed at any time with **Edit item** on the item’s page. The item moves to its new tab, and its stock, lots and History stay as they are.

## Find items {#find}

Items opens on Products, or on the first type that has items. **All** shows every type at once.

- The **Search** box finds an item by part of a code, or of its name or a variant’s in any language, with or without accents; a Chinese name by its pinyin too, or by a single character. Each tab’s count follows the search. When this tab has no match, the list says where the matches are, with a button there.
- The **Category** list offers the categories that have items on this tab, with their counts, and **Uncategorised** for the items in none. Choosing one shows its items and those of every category under it, and a chip names it; **×** on the chip shows every category again.
- **Low stock** shows the items with a code below its reorder point, or out, with their count; it sits beside **Discontinued** and is kept in the address. It counts items, not codes: an item with three codes under their points counts once.
- **Discontinued** shows the discontinued items alone, with their count. Otherwise they are hidden. **Show all in Items** in the top bar opens All with the search and the discontinued items included, and a chip saying so.
- Press **Name**, **Category**, **On hand** or the date at the head of a column to sort by it; press it again to reverse. The date column shows the date the list is sorted by, and its menu switches between **Last changed** and **Date added**.
- The list reads fifty items at a time. **Show 50 more** adds the next fifty, and a line says how many: “31 items”, or “Showing 50 of 312 items” while there are more. Back from an item returns the list with every row you had shown.
- **Export** writes what the list shows, not only the rows loaded, as a CSV file.

On a phone, each item is a card, and **Filters** opens the category, the sort and Discontinued from the bottom of the screen.

## What a row shows {#rows}

- The cover photo, or an icon for its type, then the name with its code under it. An item with several variants shows how many, and their codes.
- Its category, as a path from the top, such as Bottles › Caps.
- The stock on hand in every location, added up in the item’s unit, with “72 not usable” beside it where part of it is expired, issued to a run or at a place not available. Where its variants are counted in different units, the row says how many variants instead.
- **Low** or **Out** beside the stock, from the item’s reorder points: its worst code’s status, and for an item with several codes how many share it, as “Low · 1 of 3 codes”. The same words and colours are on Reorder. Press it to open the item’s page at **Where it stands**.

Press the row to open the item. Press its stock to open Inventory for that item alone; **×** on the chip there shows all stock again, and Back returns to Items as it was.

## Where it stands {#stands}

First under an item’s title, **Where it stands** shows each of its codes, the low ones first, and says why each figure is what it is. A part shows only when there is something to say, and only to someone who may see it.

- The code’s status and “10 left · reorder at 36”: stock that can be used, plus what is coming, less what confirmed sales still need.
- **On hand**, with what is not usable and why: expired, issued to a run, or at a place not available.
- **Free**, what you can still promise, or “20 short: orders want 90” when confirmed orders want more than there is.
- **Held**, the sales holding stock, each a link, the earliest confirmed first, with how much each holds of what it wants.
- **Coming**, the purchase orders and runs still to bring stock, each with its day.
- **Left**, with its sum in plain words: “30 usable + 0 coming − 20 for orders”.
- **By place and lot**, each place written from its warehouse down, with its lots, soonest first, each lot’s code a link to its trace, and each lot’s **Actions**, as on Stock.
- **Latest movements**, the code’s five newest, as a stock card with **In**, **Out** and **Balance**, ending with **All movements of** the code, which opens [Movements](/movements) for it. A code that nothing has moved has none.

The actions, on the code’s card beside its title, are **Change reorder point**, and **Buy** or **Make** with how many in its unit, such as “Buy 30 each” or “Make 1,000 bottles”, each shown by what your role may do; where it may not, a line says whom to ask. **Buy** and **Make** open their form filled in with the suggested order and save nothing until you create it. A code with nothing on hand or coming reads “None on hand, nothing coming.” with **Set a reorder point** and **Receive stock**.

> Only someone who may see stock sees **Where it stands**. Without permission to see locations, **Usable lots** and one “not usable” line replace the places; without permission to see orders, a number says how many orders wait; the runs need permission to see production.

## Categories {#categories}

An item is in one category, or none. Categories form one tree: a category can sit at the top or under another, up to 10 levels deep, such as Packaging › Bottles.

The tree, with each category’s items, opens from **Manage categories** at the foot of the Category list.

1. Press **Add category**, type its name, and choose what it sits **Under**, or none to put it at the top.
2. **Actions** on a row has **Rename**, **Move** and **Delete**. A category cannot move under itself, so its own branch is not offered.
3. Choose a category for an item with **Edit item** on its page, or for many with **Set category**.

> Only someone who may change items sees **Add category** and **Actions**. Anyone who can see items can read the tree.

## Add an item {#add}

1. Press **Add item**.
2. Under **What is it?**, choose its type. From a type’s tab that type is chosen already; from **All**, none is.
3. Type its name, and choose its **Category**, or **None**. Once your organization has set the language its items are named in, the name’s field says which: type it in that language.
4. Type the **Code**: your own code for this item, unique in your organization, such as RM-VITC for a raw material. It is not a barcode.
5. Choose its unit, what its stock is counted in.
6. If it comes in more than one size, give this one’s size or variation, such as 60ct.
7. Turn on **Track lot numbers and expiry** if each delivery has a lot code. This cannot be changed later, and equipment never offers it.
8. Press **Add item**.

The new item’s page opens in the form’s place, so Back returns to Items.

## Change several at once {#several}

A check box leads each row, and the one at the head of the list ticks every row loaded. Ticking shows a bar with how many are selected.

- **Set category** asks which category, or **None**, and then **Move** moves them.
- **Discontinue** runs at once.
- **Clear** unticks them all.

Each change says what it did and offers **Undo** for 10 seconds, which puts every item back as it was. Another tab, a new search, a filter or a sort unticks everything, so nothing you cannot see is changed. The most it takes at once is 500.

> Only someone who may change items sees the check boxes.

## Variants, images and names {#variants}

On an item’s page, its type and category are under the name.

- **Edit item** changes the name, the description, the category and the type.
- **Add variant** adds another size, with its own code and the unit its stock is counted in.
- **Edit** on a variant records its weight, its size and how many ship in a case.
- **Add images** takes up to 8 photos. The first is the cover, shown beside the name in lists.
- **Edit names** gives its name in other languages: a screen or a picker names the item in the language its reader uses, where it has a name in it, and a document names it in the language it prints in.

The **Names in other languages** table has a row for the item, and one for each variant with a name of its own, with a column for each language. The item’s row starts with its own name, the one it was added with.

Once your organization has said which language its items are named in, under **Items are named in** on [Organization](/settings/organization#documents), that language’s column comes first and holds each row’s own name, marked **Item’s own name**. It is the name in that language, so it is never missing there, and **Edit names** has no field for it: change it with **Edit item**. The other languages’ names are kept beside it, and a reader in a language with none sees the own name. Until the language is set, the own name is shown in every language that has no name of its own; on the item’s page it is marked **Item’s own name** in its row, and a line above the table says it counts as no language’s name yet, and where the language is chosen.

The languages your documents require are marked. A required name that is missing reads **Missing**, and **Add** opens **Edit names** at that row. A line at the top of the page says that orders and invoices holding the item cannot print until it is added.

> Only someone who may add items sees **Add item**, and only someone who may change them sees **Add variant**, **Edit item**, **Edit**, **Edit names** and **Discontinue**.

## Write its recipe {#recipe}

A recipe is what one batch of a variant uses.

1. On the item’s page, press **New recipe**. If it has more than one variant, choose which under **For** first.
2. Say how many one batch makes, and the licence it is made under, if any, and press **Create draft**.
3. Press **Add component** for each thing it uses, in batch amounts, not per unit.
4. Press **Promote**. New runs use it, and the recipe it replaces is archived.

An active recipe cannot be edited: **New version** copies it to a new draft.

> Only someone who may create recipes sees **New recipe** and **New version**, and only someone who may change them sees **Add component** and **Promote**.

## One product for two markets {#markets}

A product sold in two markets is one item, with a variant for each market:

- Each variant has its own **Code**, such as FOCUS-60-CA and FOCUS-60-CN.
- Each has its own recipe, made under that market’s licence: Health Canada’s for one, SAMR’s for the other.
- Each has its own names, so the variant for China can print as 专注胶囊 60 粒.

Two markets can also share a licence and a bottle, each recipe with its own label.

When a formula changes over time, it keeps its item and its code: press **New version** on its recipe, change what it uses, and press **Promote**.

Barcodes come later. The Code is your own, not a barcode.

## Words you’ll meet {#words}

- **Code**: the code on a variant’s label. Every variant has its own.
- **Variant**: one size or kind of an item, what stock is counted in.
- **Own name**: the name an item or a variant was added with. Once items are named in a language, it is the name in that language.
- **Uncategorised**: in no category.
- **Low stock** and **Out**: below its reorder point, and none left, said of an item by its worst code. See [Reorder points](/inventory#reorder-points) and [what each count counts](/inventory#counts).
- **Discontinued**: taken out of use with **Discontinue**, so no longer offered when an item is chosen. **Reactivate** brings it back.
- **Draft**, **active** and **archived**: a recipe being written, the one in use, and one replaced.

## If something is refused {#refused}

- A code already in use is refused under **Code**, with a link to the item that has it. Each variant needs its own.
- A category that holds items or other categories cannot be deleted. The refusal says how many of each: move them to another category first.
- A category cannot move under itself, and two categories side by side cannot share a name.
- Categories go at most 10 levels deep. A category added or moved deeper is refused: choose a place higher up.
- Orders and invoices cannot print in a language your organization requires while an item on them has no name in it, except in the language items are named in, which each item’s own name meets. The refusal says whether the item’s name or a variant’s is missing.
- A recipe with no components cannot be promoted. Add what it uses first.
- An item has at most 8 images. Remove one to add another.
- An export of more than 50,000 rows is refused. Choose a type or a category, or search, to narrow it.
- Up to 500 items change at once. Untick some to go on.

See also [Inventory](/inventory), [Licences](/licences) and [Production](/production#plan).
