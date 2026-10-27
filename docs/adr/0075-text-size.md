---
status: accepted
date: 2026-10-18
amends: [ADR-055]
---

# ADR-075 — Text size: the person's choice, and text that grows (amends ADR-055)

**Context.** ADR-055 set five type sizes in `rem`, body 14.5px and
caption 12.5px, so a browser's font size already scales them. Two things
keep that from the people who need it. Most never find the browser's
setting, and many work on a shared or locked-down computer where they
cannot change it. And the widths beside the text are in px: where text
does grow, it is cut with "…" or squeezed into a column of words, in the
232px rail, the 300px summary, the 200px email cut and the fields in
dialogs. Chinese at 12.5px is harder still, its characters denser than
Latin letters. Browser zoom (⌘ +) scales everything and stays the way to
200% (WCAG 1.4.4), but it scales the spacing too and pushes the layout to
its narrow form, which a person who only wants larger text did not ask
for.

**Decision — a Text size choice, in three steps.** Standard, Large and
Larger: 100%, 112.5% and 125% of the browser's font size, set as
`font-size` on `<html>`.

- A percentage multiplies the browser's own setting rather than replacing
  it, so someone who has raised it there keeps that and gains this on
  top.
- Every type size is in rem, so one value moves every screen. At Larger,
  body is about 18px and caption about 15.6px.
- Standard is today's design: nothing changes for anyone who does not
  choose.
- No step past 125%. The breakpoints are in px and do not move with the
  text, so a larger step would crowd the wide layout rather than help;
  past that is browser zoom's job, which narrows the layout as it goes.

**Decision — where it is chosen.** In the avatar menu beside the colour
mode and the language, and on the signed-out pages beside the language:
a person who cannot read the sign-in page needs it before they can sign
in. Each option is drawn at the size it gives, so the choice is seen
before it is made.

**Decision — this device's, as the colour mode is.** Kept in the
device's storage, applied before the first paint, and followed by the
device's other open tabs. The size a person needs depends on the screen
as much as on them: a phone held close, a monitor across a warehouse
desk. No column and no migration.

**Decision — a width that holds text is in rem.** A width beside or
around text (a label column, a field, a panel, the rail, the email cut,
a flex basis) is written with `rem()` from `theme/rem.ts`, so it grows
with the text and the cut or the wrap falls where it does at Standard.
Spacing, borders, icon-only boxes and image sizes stay in px. A font size
written in px on a page ignores the choice, so the three that were
(Home's summary and its cards' figures, the status pages' message)
become rem.

**Decision — less motion when asked.** Under `prefers-reduced-motion:
reduce` transitions end at once and scrolling jumps: the drawer, menus,
dialogs and the gallery's zoom. What says something is still happening,
a spinner or a skeleton, keeps moving.

**Also fixed.** A variant's chevron on a product had no name, so a screen
reader announced only "button". It is now named "Details of" its SKU,
with `aria-expanded` saying whether it is open. The accessibility spec's
product gets a weight, so the chevron is on the page axe scans.

**Considered and not done.**

- **Raising Standard.** ADR-055's sizes were compared on real screens and
  chosen; a person who needs more chooses it, and nobody's screen moves
  unasked.
- **Saving the size to the account**, to follow the person to another
  device: a column for a choice that depends on the screen. Deferred,
  below.
- **A size per organization:** what someone can read is theirs, not their
  employer's.
- **Scaling the spacing as well:** that is zoom, which the browser already
  does.
- **ADR-055's density setting** stays deferred: it is rows per screen, a
  separate question from the size of the words.

**Consequences.**

- Client only: `theme/text-size.ts` holds the choice, `TextSizeSelect`
  offers it, and `main.tsx` applies it before rendering. `theme/rem.ts`
  is the one px-to-rem helper, which the theme and the widths share.
- Tests: the store and the select in Vitest; `e2e/text-size.spec.ts`
  checks the choice applies, survives a reload and is offered signed out,
  and that at Larger the main screens never scroll sideways, at desktop
  width and at 320px (WCAG 1.4.10).
- conventions.md's The look gains the rem rule; manual checks section 28.
- No server change and no migration.

**Deferred.** The text size on the account, applied at sign-in as the
language is (ADR-054). Trigger: someone asking for their size to follow
them to another device.

**Amendment (October 2026) — settled while building, and in review.**

The text size was built as decided. Walking the main screens at Larger
found pages that scrolled sideways on a phone, nearly all of them at
Standard too; the larger text only made them wider. Each was fixed where
it is shared, so one change covers every screen that uses it.

- **A box of 100% meant to be one pixel.** The time zone form's polite
  live region was written `width: 1, height: 1`, which `sx` reads as 100%,
  so it ran from beside the rail past the window's edge. It is `'1px'`.
  Written out rather than MUI's `visuallyHidden`, which would make
  `@mui/utils` a direct dependency for one box.
- **Banners wrap.** The theme's Alert wraps: its message keeps a floor of
  10rem beside the icon, and its buttons drop to their own line at the
  right when they do not fit beside it. The closing organization's banner
  had dragged every page wider while a deletion was pending.
- **Rows of buttons wrap.** PageHeader's action row wraps, and a page
  passes its buttons as a fragment, so each is a child of that row; 15
  pages passed a row of their own, which never wrapped. The theme's
  DialogActions wraps the same way. A list's date range wraps.
- **A button never shrinks, and breaks its label only as a last resort.**
  `MuiButton` keeps `flexShrink: 0` and drops `nowrap` for a cap at its
  container's width, so "New version" still never stacks beside other
  buttons, and a label wider than all its space, on a phone at Larger,
  takes a second line instead of running off the screen. In a table cell
  it stays on one line; the table scrolls. conventions.md's rule that
  labels never wrap is narrowed to this.
- **Grids cap their floor at the row.** Home's three grids ask for
  `min(rem(…), 100%)`: a 320px floor was wider than a phone's row at any
  size.
- **The audit log on a phone.** Its filters sit in FilterRow, and the
  Action column has a 260px floor, so the table scrolls in its box rather
  than squeezing the entry into single words. Codes in it stay whole, as
  ADR-055 asks.
- **The rail's widths** are in `layout/rail.ts`: as rem() calls, not
  literals, they broke fast refresh's rule in `side-nav.tsx`.
- **The review's simplifications.** `useTextSize()` returns only the size,
  and the picker calls `setTextSize`, as `useBrand` and `setBrand` work;
  the picker has no `renderValue`, since MUI shows the option's label.
  Five more widths that hold text went to rem: a person's label column,
  the numbering digits field, the History drawer, the People search and
  the gallery's zoom readout.
- **Tests.** `text-size.spec` walks 14 screens at Larger, at desktop width
  and at 320px, and names the innermost element past the right edge, so a
  failure says what to fix. On fresh organizations it proves Home with
  its cards and a closing banner on a phone, both of which the shared
  walk met only by chance; it opens a dialog on a phone in French, where
  labels run longest, and reads a button's transition with and without
  reduced motion.
- **Manual checks.** Section 28, MC-2801 to MC-2807, and MC-R15 to MC-R20
  for the fixes, each in the commit that made it.
- **Not done.** A lint rule against px widths: nothing yet enforces the
  rem rule, and the simplify pass found five widths the first pass
  missed. Trigger: the next px width to slip through a review. Splitting
  the walk into a test per screen, faster but unlike `accessibility.spec`.
