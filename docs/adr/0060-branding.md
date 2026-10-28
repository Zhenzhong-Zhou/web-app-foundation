---
status: accepted
date: 2026-10-09
amended-by: [ADR-082]
---

# ADR-060 — Branding: each organization's logo, colour and expiry days

> **Amended by [ADR-082](0082-the-products-brand.md).**
> Before sign-in, the product's mark and name, and a © line. After it, from 1200 px the organization's logo moves to the rail's top, linking Home, and "Powered by Panivo" sits at the rail's foot. An organization's documents carry no product mark.

## Context

ADR-055 made the brand a few values, the accent colour, the logo
and the sidebar's shade, so that each organization could one day set its own.
ADR-058 left the expiry thresholds (90 and 30 days) to the same decision, and
ADR-059 now stores files, so a logo has somewhere to go. The open decision
already listed what branding needs; this ADR decides it, so that the first
organization other than the developer's own sees its own name and colour,
and its own idea of "expiring soon".

What shapes it:

- **No brand may break a screen.** White text on a pale accent is unreadable;
  an accent the red of a warning makes every button look like an error.
  ADR-055 keeps status tones out of the brand for that reason.
- **One domain for every organization.** The browser's tab icon and the sign-in
  page come before anyone signs in, so they stay the product's own; branding
  starts once the organization is known.
- **People who are not designers.** An owner picks a colour once, from a phone
  as often as a desk. Choosing must be safe by default.

## Decision — Settings → Organization → Branding, for whoever may change the organization

A tab of the Organization page (ADR-061), behind
`organizations.update`, with its own Save: the logo, the colour and the
sidebar's shade, which is to say how the app looks. Every member sees the
result; only those who may change the organization see the tab. The two
other settings this ADR adds are rules, not looks, so they sit with their
kind: the expiry days on the Stock tab beside Licences at release, and
"Print the logo" on the Documents tab beside Document languages.

## Decision — the logo, stored as ADR-059 says

- Uploaded through `POST /v1/files/logo`: PNG, JPEG, WebP or SVG, at most 2 MB,
  at least 256 px wide; kept as one PNG at most 1024 px, an SVG drawn to PNG
  and never kept.
- `organizations.logo_file_id`. Saving a new logo attaches it and releases the
  old one in the same transaction (`FilesService.attach`, `release`);
  removing the logo releases it. A released logo is purged 30 days later.
- **Previewed before saving** on both of the sidebar's shades, at the size it
  will show, so a logo made for white is seen on dark before anyone else does.
- **Where it shows:** the top of the side rail, at most 32 px tall (ADR-055),
  the organization's name in text when there is none; on the dark rail it
  sits on a white plate, since most logos are made for white. Printed
  documents below.
- **One logo.** A second version for dark backgrounds waits for a logo the
  white plate does not suit (Deferred).
  *Amended (October 2026): an optional square logo beside it, for the
  places only a square fits (below).*

## Decision — the colour: presets, or a custom colour made safe

- **Six presets**, each tested in both colour modes: indigo (`#5546B8`, the
  default), blue, teal, green-slate, plum and charcoal. None is near the red,
  amber or green of the status tones.
- **A custom colour**, typed as hex or picked. It is checked the way ADR-055
  checks its own tokens, in both modes:
  - light: white text on the accent, and the accent as link text on white,
    at least 4.5 : 1 (WCAG AA);
  - dark: the accent mixed 45% toward white (ADR-055's rule), with dark text
    on it and as link text on the dark surface, at least 4.5 : 1.
- **Never refused, made to pass.** A colour that fails is darkened (or, for
  dark mode, lightened) along its own hue, keeping its chroma, to the nearest
  shade that passes. The section shows both: the colour chosen and the one
  that will be used, with why. What is saved is the shade that passes, so
  every stored colour is readable without checking again.
- **A warning, not a block,** when its hue is within 25° of the danger,
  warning or success tone at a strong chroma: "This colour is close to the
  red used for errors; buttons may read as warnings." The owner decides.
- The same check runs on the server when saving, so a colour that skipped the
  page is held to the same rule. `organizations.accent_color`, `#RRGGBB`, null
  for the default.

## Decision — the sidebar's shade

`dark` (the default) or `light`, ADR-055's
two rails, chosen beside the colour and previewed with the logo.
`organizations.rail`.

## Decision — expiry days, the organization's

They are on the Stock tab.

- Two numbers, **warning** (default 90) and **critical** (default 30), with
  critical less than warning, both from 1 to 365.
  `organizations.expiry_warning_days`, `expiry_critical_days`.
- Every place that says "expiring" uses them: the inventory's chips and its
  Expiring filter, a lot's chip on every page, and Home's Expiring card and
  its count. The client's `EXPIRY_DAYS` constant becomes the organization's
  values, read with the rest of its settings; the server's
  `EXPIRY_WARNING_DAYS` becomes the organization's warning days.
- Licence notice (60 days) and an overdue grace stay as they are (Deferred):
  nobody has asked, and each is one more number to explain.

## Decision — the logo on printed documents, a choice

It is on the Documents
tab. Invoices, credit
notes and packing slips print the logo at the top left, at most 18 mm tall,
when the organization has one and `organizations.logo_on_documents` is on,
which it is by default. Off keeps the paper as it is now, for an organization
whose stationery already carries its logo. Documents already issued are not
reprinted: the logo is whatever the organization has when the PDF is made.

## Decision — the theme follows the organization

After sign-in the client
builds its theme from the organization's accent and rail, as it builds it
from ADR-055's defaults today. Before sign-in, and for a person in no
organization, the defaults. Switching organization rebuilds it. The values
come with the organization's other settings; nothing new is fetched.

## Consequences

- Built in this order, each its own commit:
    1. The section designed on the Claude Design canvas: Branding on desktop
       and on a phone, in English and Chinese, a custom colour adjusted and
       warned, the logo previewed on both rails. Reviewed before building
       (done), then redrawn into ADR-061's tabs. ADR-061 is built first, so
       Branding, Stock and Documents are tabs to fill.
    2. Migration 0050: `logo_file_id` (a foreign key to `files`),
       `accent_color`, `rail`, `expiry_warning_days`,
       `expiry_critical_days`, `logo_on_documents`, each with its check.
    3. The server: the fields on the organization's read and update, the
       colour check, attaching and releasing the logo, Home's Expiring card
       by the organization's days, the audit of each change.
    4. The client: the theme from the organization, the Branding section, the
       logo in the rail, the expiry chips and filter by the organization's
       days.
    5. The logo on invoices, credit notes and packing slips.
    6. Manual checks: a custom colour adjusted and used everywhere, a logo on
       both rails and on paper, the expiry days changing a chip and Home.
- The colour check is one function, in the client for the preview and in the
  server for the save, with the same tests in both: the packages share no
  code (as the catalogues, ADR-054).
- Nothing changes for an organization that sets nothing: the defaults are
  ADR-055's and ADR-058's values.

*Amended while building:*

- **The logo shows where ADR-055 put the organization**: the top bar's left
  corner and the phone menu's header, at most 32 px tall, the name in text
  until there is a logo. On a white plate in dark mode, and in the phone
  menu while the rail is dark.
- **The theme follows the session.** `/v1/auth/me` carries the branding
  and the expiry days, so no page asks for them; the theme sits outside the
  router and AuthProvider inside it, so a small store between them hands
  the colour over, and signing out returns the defaults.
- **Indigo is saved as no colour**, not as `#5546B8`, so a change to the
  default reaches every organization that never chose.
- **One Save for the Branding tab** (logo, colour, rail); the expiry days
  and "Print the logo" are saved on their own tabs, each refreshing the
  session so the chips and the paper follow at once.
- **The logo prints from the print sheet itself**, so invoices, credit
  notes and packing slips all have it without three copies of the rule.
- **Home's link to Stock**, built after: the Expiring card names the
  organization's days ("Nothing expires within 180 days") and, for those
  who may change them, links to the Stock tab: "Change the days".

## Considered and not done

- **Refusing a colour that fails contrast.** Correct, and unkind: an owner
  with a brand colour would be told no without being offered anything. The
  nearest passing shade keeps their hue and keeps every screen readable.
- **Free colour, unchecked.** Some products allow it; a pale accent would
  leave every primary button unreadable for that organization's people.
- **A full theme** (fonts, radius, surface colours). More values to break,
  and nobody has asked; ADR-055 keeps the brand to a few on purpose.
- **A per-organization tab icon and sign-in page.** Before sign-in there is
  no organization, and a home-screen icon belongs to the website.
- **The logo in the database.** ADR-059 decided one store for every file.

## Deferred — each with what brings it in

- **A second logo for dark backgrounds.** Trigger: a logo the white plate
  does not suit, such as a white wordmark.
- **Licence notice days and an overdue grace per organization.** Trigger:
  the first organization that asks.
- **A white-labelled domain, tab icon and sign-in page.** Trigger: a customer
  who sells the product under their own name.
- **The colour on emails.** The security emails stay the product's
  (ADR-037). Trigger: an organization whose customers receive email from
  the app.

## Amendment (October 2026) — a square logo of the organization's own

ADR-082 moved the logo to the rail's top and gave the folded rail one
44 px plate, which shows the logo when it is about square and the
organization's initials otherwise. Most logos are wordmarks, so most
plates show initials; and on a phone under 360 px at Larger text
(ADR-079) a wide logo shrinks to something nobody can read. Many firms
also keep a small square mark, for an app icon or a social profile. This
amendment lets an organization upload one beside its logo (Bob, 25
October 2026, as recommended).

Checked before drafting, as the working agreements ask:

- **Fired, and taken here.** ADR-082's as-built line: a small square logo
  of the organization's own, uploaded separately, the plate's first
  choice ahead of the initials. #246, in the two files this changes: the
  open rail's fold button and the menu drawer's Close take the theme's
  focus ring, 2.24 : 1 on the dark rail, rather than the rail's own.
- **Not fired, and kept in step.** This ADR's second logo for dark
  backgrounds: the square logo sits on the same white plate, so a white
  mark would vanish there too, and when that trigger fires both logos get
  a dark version. This ADR's white-labelled tab icon, and ADR-082's one
  icon on a plate: the square logo is never the tab icon or a home
  screen's. ADR-077's invitation page keeps the main logo. ADR-082's
  deferred "the mark in an organization's emails" waits for the emails'
  design, next, which may take the square logo for that header. Open
  decisions, "One person in two organizations": a switcher between
  organizations would show each one's square logo, read with its branding
  as the plate does. #245: the plate's initials are data and take
  `translate="no"` there, not here. #170 (every new control 44 px), #198
  (Branding already asks before unsaved work is left; a square logo added
  or removed counts), #148 (the refusals in plain words), #142 (nothing
  new loads from another site), #150 (the guide section added here is not
  in the translation review's export).
- **Found while checking.** The Organization guide (ADR-079) has no
  section for the Branding tab, in any language. `seed:demo` sets no logo,
  so no demo has shown one on the plate. The server keeps a logo as PNG by
  testing that its kind renders as a logo, so a second logo kind would be
  written as WebP unless handled. The 1.25 that decides "about square"
  lives only in the client's `rail-top.tsx`. MC-3510's "with a square
  logo" means a square main logo. The plate is `rem(44)`, growing with
  the text size, but draws its image at a fixed 28 px, so at Larger text
  a square main logo sits small in a larger plate. A logo is kept and
  served at its one size, up to 1024 px, however small it is drawn. The
  logo's upload says nothing while it runs but a disabled button, which a
  screen reader does not announce.

### Decision — an optional square logo, beside the logo

On Branding,
saved with the tab's one Save: **Square logo** (« Logo carré »,
方形标志), marked optional. On a computer the two logos sit side by
side, one brand in two shapes; on a phone the square logo follows the
logo. Each row has a line saying what it is for: the logo's "Wide or
square, at the top of the sidebar."; the square logo's "For small
spaces, such as the folded sidebar.", followed, while it has none, by
what this organization shows there instead: its initials, or, when its
logo is about square, that the logo already shows there and a square
logo is only for a different mark. Both rows are one component; while
either uploads, "Uploading…" is said in words as well as shown, so a
screen reader hears it. The preview shows each sidebar shade both open
and folded, the plate chosen by the same rule as the rail's.

### Decision — where it shows, and only there

- **The folded plate** takes the first of: the square logo; a main logo
  about square (at most 1.25 : 1), as ADR-082 built; the organization's
  initials. On the white plate, as ADR-082 drew a square logo there, the
  image at most 28 px at Standard text and in rem, so it grows with the
  plate as the initials do (amending ADR-082's plate, whose image was a
  fixed 28 px).
- **Beside the name.** With no main logo, the square logo stands beside
  the name wherever the name stands in for the logo: the rail's top, and
  below 1200 px the top bar and the menu drawer's header.
- **The tight bar.** On a phone under 360 px at Larger text, where
  ADR-079 shows the logo or the initials alone, the square logo comes
  first, then the main logo, then the initials.
- **Nowhere else.** The tab icon and home screens stay the product's
  (ADR-082); documents print the main logo (above); the invitation page
  keeps it (ADR-077); emails wait for their own design.

### Decision — the file

- A kind of its own, `square_logo`, uploaded through
  `POST /v1/files/square-logo` behind `organizations.update` (ADR-059,
  one route per kind), and read by any member, as the logo is.
- PNG, JPEG, WebP or SVG, at most 2 MB, as the logo. A raster at least
  128 px on each side, and any image at most 5 : 4 either way, the
  plate's own 1.25. Refused otherwise, nothing kept: "A square logo must
  be at least 128 pixels on each side." and "A square logo must be about
  square, at most 5 : 4 either way. Use a wide image as the main logo."
- Kept as two PNGs: `full`, at most 512 px on its longer side, for
  Branding and room for a switcher later; and `thumb`, at most 128 px,
  which the plate and the bars ask for, sharp on a 3× screen at a few
  kilobytes rather than the 512 px file on every first visit from a phone
  or from China (ADR-059's reason for sizes). A size it does not keep is
  answered with `full`. An SVG is drawn and only the PNGs kept. Never
  cropped or padded, and a raster never enlarged.
- `organizations.square_logo_file_id`, attached and released in the same
  transaction as the logo, so a replaced one is purged 30 days later
  (ADR-059); recorded in the audit as the logo is, in words (ADR-076);
  carried with the session's branding on `/v1/auth/me`. Every change is
  an addition, so the API revision stays where it is (ADR-081).

### Considered and not done

- **Edge to edge on the plate,** as a phone's app icon. Right for an icon
  with its own background; a transparent mark would touch the plate's
  edges and lose its corners, and telling the two apart means reading the
  image's edges.
- **Cropping or padding to a square on the server.** A crop cuts into the
  mark (ADR-063 crops only faces); padding changes what the owner
  uploaded. Refusing beyond 5 : 4 says what to do instead.
- **A square logo made from the main one,** its first letters or its left
  part. A guess at someone's brand.
- **The square logo as the tab icon after sign-in.** One domain, one icon
  (ADR-060, ADR-082).
- **Drag and paste onto the row,** as product images take them. A logo
  is set once or twice in an organization's life; the button is enough.
- **A checkerboard behind the thumbnail** to show transparency. The two
  sidebar previews already show the logo on dark and on white.

### Deferred

- **A smaller copy of the main logo for the rail,** which is drawn at
  most 32 px tall from a file up to 1024 px wide. Trigger: the whole-app
  review's Lighthouse run, or a perf run, naming the logo's bytes.

### Consequences

- Migration **0075**: `square_logo_file_id`, and `square_logo` in
  `files_kind_check`.
- Server: the kind, its route, its checks and its two sizes; the
  organization's update and read; the audit's words; the catalogues.
- Client: the Branding rows side by side, one component for both logos,
  with the fallback line and "Uploading…"; one rule for the plate, used by
  the rail and the preview; the plate's image in rem; `OrganizationMark`
  with no main logo and on the tight bar; `thumb` wherever the square logo
  is drawn small.
- Riders: #246; the Organization guide's Branding section in three
  languages.
- Seeds: `seed:demo`'s organization gets a square logo and no main logo;
  `seed:volume` adds nothing (one nullable column, read with the session
  as branding already is).
- Manual checks: a section of their own, MC-3601 onward; MC-3510
  reworded.
- Designed on the canvas (the row "The organization's square logo"); the
  brief in `tmp/square-logo/`. The pull request carries `full-e2e`, since
  it adds rows to `accessibility.spec.ts`.

### As built (#251, 26 October 2026)

Built as decided, in the brief's
steps. What building corrected and settled:

- **Three corrections to the amendment above.** Branding never had the
  unsaved-changes question the check above credits it with: ADR-061's
  "switching
  tab with unsaved changes asks first" was not built for the Organization
  page, #198 is that gap, and none was added here. "Every change is an
  addition" was not quite true: the upload response's `kind` is one enum
  for every route, so it gains `square_logo` on the two existing upload
  routes, which oasdiff calls breaking (response-property-enum-value-added).
  Each route returns only its own kind and `square_logo` comes only from
  the new route, so both lines are accepted in
  `server/openapi-breaking-accepted.txt` and the API revision stays.
  Branding's thumbnail asks for `thumb`, as the preview does, not `full`:
  128 px is enough for 40 px on any screen, so nothing downloads twice;
  `full` stays kept for a switcher later.
- **The plate.** One rule, `usePlate` in `client/src/layout/use-plate.ts`,
  and one `Plate` component, used by the rail, the name beside it and
  Branding's preview, so the three cannot disagree. The 1.25 lives there,
  `images.ts`'s copy pointing at it. The plate's image is `rem(28)`, so it
  grows with the plate at Larger text, a square main logo included.
- **Branding.** One row component for both logos, each row a group named
  by its heading, so a screen reader can tell the two Replace and the two
  Remove buttons apart; Remove is a text button for both. The square
  logo's fallback sentence sits on a line of its own, since Chinese joins
  sentences without a space. When an upload ends, the row says "Uploaded.
  Press Save branding to use it." in place of "Uploading…", since nothing
  else says the file counts only after Save; after Remove, focus moves to
  the row's upload button. The whole sidebar preview, heading included,
  is hidden from screen readers, the line saying in words what the plate
  shows; with no logo, its open rail now shows the name, as the rail does.
- **A rider, the colour sample.** The sample under Colour read "Save
  branding" and looked exactly like the real Save, the first one an owner
  reaches on a phone. It now reads "Example" under the caption "Buttons
  will look like this:", a plain box, neither focusable nor read aloud.
- **Files.** One drawing helper draws an SVG at each target size by its
  density, rather than once at 300 dpi and scaled, so a 40 px SVG comes
  out sharp at 512; one `ImageRefused` class carries the three refusals.
  That also mended the main logo: an SVG declared 1,700 px or wider broke
  the pixel limit at 300 dpi and was refused as damaged; it is now kept at
  1,024. Each kind names its format, `png` or `webp`, in place of the test
  on its render that the check warned about, and `FilesService.swapFile`
  attaches and releases both logos.
- **Words.** The catalogues' extraction (formatjs) turned no-break spaces
  into plain ones, on the server and on the client; both now run with
  `--preserve-whitespace`, so "5 : 4" stays on one line in French.
- **Commits.** The migration and the server are one commit (d0201a16):
  `FILE_KINDS` is shared by the code and `files_kind_check`, so adding
  `square_logo` needs `KIND_RULES`' entry and changes the API, while
  leaving it out fails the schema test that the code knows every value the
  check allows; no split of 0075 stayed green. The client (e8da2bd1) and
  the guide (e981184f) went in without their manual checks, which came
  with the seeds (6440912e), as the brief had them: the brief's mistake.
- **Tests and checks.** #246's ring test waits until the rail has switched
  before it measures, after failing 2 runs in about 44 in Linux WebKit; an
  `accessibility.spec.ts` row for Branding on a fresh organization, at
  `?tab=branding` as ADR-061's as-built has it; two screenshots,
  15-branding and 16-rail-folded; MC-3601 to MC-3610, with MC-3510 and
  MC-1702 changed. Claude Code Review, re-run once CI had finished, found
  no issues.
- **Dependencies.** @nestjs/swagger 12.0.4 and pdfmake 0.3.13, taken
  inside the 7-day wait by Bob's choice (4fdb332d). The branch's first
  dependency step found `npm update --before` wrong, and
  `docs/conventions.md` now judges each package by its own publish time.
- **Left for issues.** #249, "File too large" in English with no next step
  on every upload route; #250, Receive stock saying "No products yet"
  while they load; the rail's folding dropping focus, added to #155; #252,
  Claude Code Review ending without a review when it stops to wait for the
  pull request's other checks, which the check from #243 caught on #251.
