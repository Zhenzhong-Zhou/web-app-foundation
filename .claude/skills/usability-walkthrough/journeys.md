# Journeys

What a panel walks (`/usability-walkthrough panel <journey>`, the
skill's section 6): each journey is a task a person takes through the
application from start to end, in their own words, with the personas
from [personas.md](personas.md) who take it. A panel walks a journey as
all its personas at once, at the sizes the skill gives them, unless the
journey's **Sizes:** line names its own. Add a journey when a feature
brings a task people do often.

## home

What needs doing today, from Home and one step past it.

- **Starts on:** Home.
- **Personas:** the senior who reads only Chinese, the outsider on the
  first day, the owner who learns fast, the operations lead.
- **Tasks:** what needs you today; find the order that is late; find
  which lot expires first; see whether anything is running out; raise an
  order.
- **For the senior:** the first, fourth and third tasks only, in that
  order: what needs you today, is anything running out, which lot
  expires first.
- **For the outsider:** first tell from Home what this company does;
  then what needs doing today, one thing that is late and one running
  out; and try to raise an order.
- **For the operations lead:** from each of Home's tiles, reach the
  detail behind it; sort, filter and export that list; follow a lot to
  its trace.
- **Sizes:** each persona at a width class of its own: the senior on a
  phone, 390 × 844; the outsider on the iPhone Duo, closed, about 466 ×
  678, then open, about 890 × 626; the owner on a tablet, upright, 820 ×
  1180, then held sideways, 1180 × 820; the operations lead on a laptop,
  1366 × 768, where the rail first shows, then on a desktop, 1920 × 1080.

## customise-home

Arranging Home for oneself, and finding it the same on another device.

- **Starts on:** Home.
- **Personas:** the senior who reads only Chinese, the owner who learns
  fast, the operations lead.
- **Tasks:** put the tiles you use first; hide one you never need, then
  bring it back; show the drafts and open them; turn Recently opened
  off; go back to how it was; open Home on another device and find it as
  you left it.
- **For the senior:** by the buttons, not by dragging.
- **For the owner:** by touch, dragging where they can.
- **For the operations lead:** by mouse, then each task again by
  keyboard alone.
- **Sizes:** the senior on a phone, 390 × 844, the other device a tablet
  upright, 820 × 1180; the owner on a tablet held sideways, 1180 × 820,
  the other device a phone, 390 × 844; the operations lead on a laptop,
  1366 × 768, where the rail first shows, the other device a desktop,
  1920 × 1080.

## join

A person's first day, from the invitation to their first task.

- **Starts on:** the invitation's email, in Mailpit.
- **Personas:** the outsider on the first day, the senior who reads
  only Chinese.
- **Tasks:** accept the invitation and choose a password; find out what
  you may do here; do the first thing the welcome suggests.

## set-up

An owner making the application their company's.

- **Starts on:** Home, as the Owner of a new organization made for the
  walk (the skill's section 6), so Getting started leads Home; its mail,
  the address's confirmation among it, in Mailpit
  (<http://localhost:8025>).
- **Personas:** the owner who learns fast.
- **Tasks:** put the company's name and logo on its documents; set its
  time zone; invite a colleague.

## items

Finding, adding and sorting what the company keeps, from Items.

- **Starts on:** Items.
- **Personas:** the novice bookkeeper, the owner who learns fast, the
  warehouse worker, the operations lead.
- **Tasks:** find a raw material in a category; add a packaging item;
  put the uncategorised items into categories; see which products are
  low and open one's stock; change an item's type.

## stock

What is on hand, what of it can be used, who is waiting for it, and
what moved, from Home through Inventory, an item's Where it stands and
Movements (ADR-093).

- **Starts on:** Home.
- **Personas:** the senior who reads only Chinese, the warehouse worker,
  the first-week buyer (Mei).
- **Tasks:** find which lot of an item expires first; find why an
  item's Free is less than its On hand; find who is waiting for an item
  that is short; buy what is low; find what came in and went out of an
  item this month, and how many it had at the start; find what moved on
  one shelf; find when an order's goods came in.
- **For the senior:** the first two tasks, by reading alone: which lot
  expires first, and why Free is less than On hand; then what came in
  and went out of an item this month.
- **For the warehouse worker:** which lot expires first and where it
  is, then why Free is less than On hand, then what moved on that lot's
  shelf.
- **For the first-week buyer:** who is waiting for an item that is
  short, then buy what is low, from Home's Low stock to a purchase
  order filled in, then when a received order's goods came in, and how
  many the item had at the start of this month.
- **Lots (ADR-094):** start tracking lots for an item that holds stock
  and has never had lot numbers; then move part of a lot to a new lot.
  The senior moves part of a lot after the reading tasks; the warehouse
  worker does both after its own tasks; the first-week buyer starts
  tracking after hers. Each says every place they looked for the action
  and did not find it.

## buy

- **Starts on:** Home.
- **Personas:** the first-week buyer (Mei), the operations lead.
- **Tasks:** see what is low; raise a purchase order for it; set a
  reorder point on an item that has none.

## receive

- **Starts on:** the purchase order, or Home.
- **Personas:** the warehouse worker, the first-week buyer (Mei).
- **Tasks:** receive a delivery against its purchase order, recording
  each lot and its expiry; receive less than was ordered; find where the
  goods went; receive a delivery whose box has no lot number, letting
  the application make the code, its expiry not known yet; later, add
  the supplier's lot number and the expiry to that lot (ADR-094).

## make

- **Starts on:** Home.
- **Personas:** the first-week buyer (Mei), the operations lead.
- **Tasks:** plan a run of a made item; release it; close it with what
  it made.

## ship

- **Starts on:** the order, or Home.
- **Personas:** the warehouse worker, customer service.
- **Tasks:** ship a confirmed order; ship part of it now and the rest
  later; tell a customer where their shipment is.

## invoice

- **Starts on:** the shipment's order.
- **Personas:** the novice bookkeeper, the owner who learns fast.
- **Tasks:** issue the invoice for a shipment; credit a returned item;
  find what a customer still owes.

## return

- **Starts on:** the customer's order.
- **Personas:** customer service, the novice bookkeeper.
- **Tasks:** raise an RMA for a damaged item; receive it back; send a
  replacement or credit it.

## trace

- **Starts on:** the lookup in the top bar.
- **Personas:** the operations lead, customer service.
- **Tasks:** follow a lot to every customer who received it; find the
  lots a made lot was made from; recall a lot part of which was moved to
  another lot: every customer who received any of it, through either
  lot, and where what is left of it is now (ADR-094).

## on-the-road

- **Starts on:** Home, on a phone.
- **Personas:** the sales rep on the road.
- **Tasks:** check whether a product can be promised by Friday; find
  where a customer's order is; raise an order from the phone.
- **Sizes:** a phone, 390 × 844, and the iPhone Duo closed, about
  466 × 678: the rep is on the road, never at a desk.
