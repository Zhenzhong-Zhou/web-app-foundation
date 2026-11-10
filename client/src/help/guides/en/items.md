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

The type can be changed at any time with **Edit** on the item’s page. The item moves to its new tab, and its stock, lots and History stay as they are.

## Find items {#find}

Items opens on Products, or on the first type that has items. **All** shows every type at once.

- The **Search** box finds an item by part of a code, or of its name or a variant’s in any language, with or without accents; a Chinese name by its pinyin too, or by a single character. Each tab’s count follows the search. When this tab has no match, the list says where the matches are, with a button there.
- The **Category** list offers the categories that have items on this tab, with their counts, and **Uncategorised** for the items in none. Choosing one shows its items and those of every category under it, and a chip names it; **×** on the chip shows every category again.
- **Discontinued** shows the discontinued items alone, with their count. Otherwise they are hidden. **Show all in Items** in the top bar opens All with the search and the discontinued items included, and a chip saying so.
- Press **Name**, **Category**, **In stock** or the date at the head of a column to sort by it; press it again to reverse. The date column shows the date the list is sorted by, and its menu switches between **Last changed** and **Date added**.
- The list reads fifty items at a time. **Show 50 more** adds the next fifty.
- **Export** writes what the list shows, not only the rows loaded, as a CSV file.

On a phone, each item is a card, and **Filters** opens the category, the sort and Discontinued from the bottom of the screen.

## What a row shows {#rows}

- The cover photo, or an icon for its type, then the name with its code under it. An item with several variants shows how many, and their codes.
- Its category, as a path from the top, such as **Bottles › Caps**.
- The **stock** on hand in every location, added up in the item’s unit. Where its variants are counted in different units, the row says how many variants instead.
- **Low stock** or **Out** beside the stock, from the item’s reorder points. The same words and colours are on Home and Inventory.

Press the row to open the item. Press its stock to open Inventory for that item alone; **×** on the chip there shows all stock again, and Back returns to Items as it was.

## Categories {#categories}

An item is in one category, or none. Categories form one tree: a category can sit at the top or under another, up to 10 levels deep, such as **Packaging › Bottles**.

The tree, with each category’s items, is under **Settings › Categories**, or under **Manage categories** at the foot of the Category list.

1. Press **Add category**, type its name, and choose what it sits **Under**, or none to put it at the top.
2. **Actions** on a row has **Rename**, **Move** and **Delete**. A category cannot move under itself, so its own branch is not offered.
3. Choose a category for an item with **Edit** on its page, or for many with **Set category**.

> Only someone who may change items sees **Add category** and **Actions**. Anyone who can see items can read the tree.

## Add an item {#add}

1. Press **Add item**.
2. Under **What is it?**, choose its type. From a type’s tab that type is chosen already; from **All**, none is.
3. Type its name, and choose its **Category**, or **None**.
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

- **Edit** changes the name, the description, the category and the type.
- **Add variant** adds another size, with its own code and the unit its stock is counted in.
- **Edit** on a variant records its weight, its size and how many ship in a case.
- **Add images** takes up to 8 photos. The first is the cover, shown beside the name in lists.
- **Edit names** gives its name in other languages, for documents printed in them.

The **Names in other languages** table has a row for the item, and one for each variant with a name of its own, with a column for each language. The item’s row starts with the name it was added with, which is used in any language without its own name; a name in that name’s own language is only for printing something different. The languages your documents require are marked. A required name that is missing reads **Missing**, and **Add** opens **Edit names** at that row. A line at the top of the page says that orders and invoices holding the item cannot print until it is added.

> Only someone who may add items sees **Add item**, and only someone who may change them sees **Add variant**, **Edit**, **Edit names** and **Discontinue**.

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
- **Uncategorised**: in no category.
- **Low stock** and **Out**: below its reorder point, and none left. See [Reorder points](/inventory#reorder-points).
- **Discontinued**: taken out of use with **Discontinue**, so no longer offered when an item is chosen. **Reactivate** brings it back.
- **Draft**, **active** and **archived**: a recipe being written, the one in use, and one replaced.

## If something is refused {#refused}

- A code already in use is refused under **Code**, with a link to the item that has it. Each variant needs its own.
- A category that holds items or other categories cannot be deleted. The refusal says how many of each: move them to another category first.
- A category cannot move under itself, and two categories side by side cannot share a name.
- Categories go at most 10 levels deep. A category added or moved deeper is refused: choose a place higher up.
- Orders and invoices cannot print in a language your organization requires while an item on them has no name in it. The refusal says whether the item’s name or a variant’s is missing.
- A recipe with no components cannot be promoted. Add what it uses first.
- An item has at most 8 images. Remove one to add another.
- An export of more than 50,000 rows is refused. Choose a type or a category, or search, to narrow it.
- Up to 500 items change at once. Untick some to go on.

See also [Inventory](/inventory), [Licences](/licences) and [Production](/production#plan).
