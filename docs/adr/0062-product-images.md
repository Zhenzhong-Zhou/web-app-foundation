---
status: accepted
date: 2026-10-09
areas: [products, files]
---

# ADR-062 — Product images: a gallery per product, thumbnails in lists

## Context

ADR-059 stores photos in three sizes and has a route for
product images already, but nothing shows one. Products are recognised by
sight in a warehouse as much as by SKU: two bottles of the same brand with
different labels, a blend in a sack. A photo on the product page and a
thumbnail in the lists that pick products answer "is this the one?" before
anyone opens anything.

## Decision — a product has a gallery: up to eight images, in order, the first its cover

- `product_images`: the organization, the product, the file (ADR-059,
  kind `product_image`, attached when added, released when removed) and its
  position. One file belongs to one product.
- Eight is enough to show a product from its sides, its label and its
  certificate photo; more is a catalogue, which this is not.
- The first image is the product's cover: the one lists show. Reordering
  is dragging one to the front, or "Make cover".
- Images belong to the product, not to a variant: variants differ in count
  or size far more often than in look. A variant's own picture waits
  (Deferred).

## Decision — where they show

- **The product page**: a gallery at the top, the cover at `display` size
  (1200 px), the others as `thumb`s beneath; clicking any opens a viewer at
  `full` size (3000 px), where the browser's zoom and a pinch on a phone
  show the detail, with arrows between images.
- **Lists that pick or show products**: a 40 px cover beside the name on
  the Products list, in the item lookup, and in Inventory. Lazy-loaded,
  `thumb` size, so a page of fifty costs a few hundred kilobytes.
- **Not on printed documents.** Paper stays as ADR-041 and ADR-046 drew it.
- With no image: a neutral tile with the product type's icon, never a
  placeholder photo.

## Decision — adding, removing, reordering

On the product page, for
whoever has `products.update`: Add images (several at once, or a phone's
camera), each uploaded through `POST /v1/files/product-image` and then
added with `POST /v1/products/:id/images`; Remove, which releases the file
(purged 30 days later, ADR-059); and a new order with
`PUT /v1/products/:id/images`. Each is audited as a change to the product.
Whoever has `products.view` sees them.

- **A product with no images invites one**: a drop area with Add images,
  not an empty gallery.
- **Several at once, each on its own**: dropped or chosen together, each
  shows its progress, then "Making sizes…" while the server writes them,
  and appears in the gallery when done. One refused (a PDF, too large)
  says why and does not stop the others.
- **Every thumbnail has a menu**: Make cover, Move left, Move right,
  Remove, so the order changes without a mouse as well as by dragging.
- **Remove is undone, not confirmed**: the image goes at once with "Image
  removed · Undo" for a few seconds; the file is only released when the
  undo has passed, and purged 30 days after that (ADR-059).
- **The viewer**: Esc closes, ← and → move between images, a phone swipes,
  a double-click or double-tap zooms.
- **At eight**, Add images is disabled with the reason beside it.
- **Paste adds an image**: ⌘V or Ctrl+V on the product page adds what the
  clipboard holds, a screenshot or a picture copied from an email, through
  the same upload as Add images.
- **The same photo twice is refused**: an upload whose checksum (ADR-059's
  `sha256`) matches an image already on the product is not added, and says
  so ("Already on this product"), rather than filling a slot.
- **Every image is described for screen readers** without anyone typing:
  the product's name and its place, "Focus, image 2 of 4", and "the cover"
  for the first.

## Consequences

- Built in this order, one PR: the gallery and the lists on the Claude
  Design canvas, reviewed first; migration 0051 (`product_images`); the
  server (add, remove, reorder, the cover on every product the lists
  read); the client (the gallery, the viewer, the thumbnails); manual
  checks.
- The cover rides on the product rows the lists already read, as a file id
  and the thumb's size, so a list asks for no more than it does now; each
  thumbnail is then one cached request (ADR-059's immutable year).

*Amended while building:*

- **Not in the item lookup yet.** The lookup's results are one shape for
  eight kinds of record; a cover for one of them waits for a change that
  needs that shape anyway. The Products list and Inventory have theirs.
- **Undo is the client's.** Remove hides the image and sends the removal
  when the undo has passed, or at once when the page is left or another
  image is removed; Undo puts it back and nothing is sent.
- **Uploads report progress** through XMLHttpRequest, the one browser API
  that does; the rest of the app keeps `api()`.
- **The viewer zooms as the canvas drew it**: − and + with the level
  between them, the scroll wheel, a pinch and a double-click, 100 to
  400%, and a drag to look around once zoomed. First built with a
  double-click alone and a scrollbar.

## Considered and not done

- **Images on variants.** Three sizes of one bottle look alike; the rare
  variant that differs (a flavour, a colour) can wait for its trigger.
- **One image per product.** Simpler, and too little: the label's back is
  what a warehouse checks.
- **Images on invoices and packing slips.** Ink and pages for something the
  customer has already seen.
- **Cropping and rotating in the app.** Photos are already turned upright
  from the camera's own orientation (ADR-059); cropping is a lot of
  interface for what a phone's editor already does better.
- **A caption per image.** The order and the product's name describe them;
  a caption is one more field nobody fills in.
- **A shared image library across products.** A different feature, and it
  makes removing an image a question of who else still uses it.

## Deferred — each with what brings it in

- **A variant's own image.** Trigger: variants that differ in look, such as
  flavours or colours.
- **Images on order lines and the shipping screen.** Trigger: picking
  errors that a picture would have prevented.
- **Product images outside the organization** (a catalogue, a customer
  portal), which brings ADR-059's CDN deferral. Trigger: either one.
