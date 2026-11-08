---
paths:
  - "client/src/theme/**"
  - "client/src/**/*.tsx"
  - "client/e2e/{accessibility,text-size}.spec.ts"
---

# The look: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match:
what to keep true when a component styles itself (ADR-055;
[conventions.md, The look](../../docs/conventions.md#the-look-adr-055)).

- **A screen follows `docs/design-language.md`** (ADR-090): a change to
  it reads "The principles", its patterns in "The patterns", and "Screen
  sizes"; a pattern missing there is added first, by an ADR-090 amendment.
- **Colours, sizes and corners are tokens,** `client/src/theme/tokens.ts`,
  by name through the theme, never a hex value, font size or radius; a
  value they lack becomes one first, its pair in `tokens.test.ts`.
- **A colour given as a path goes in `sx`;** a `color` prop takes only a
  name. Lint refuses a path there, but not one kept in a variable.
- **Status is a tone:** `StatusChip` with a row in `STATUS_TONES`
  (`client/src/theme/status.ts`), the words carrying the meaning.
- **Five type sizes,** `h5`, `h6`, `body1`, `body2`, `caption`, and
  `TYPE.figure` for a count; no capitals. A font size is rem, never px; a
  width beside text is `rem(px)` (`client/src/theme/rem.ts`, ADR-075).
- **One filled button per group;** heights by the theme's density; no
  outline removed.
- **Breakpoint props where a layout breaks,** CSS `display` deciding what
  shows, not a `useMediaQuery` branch
  ([conventions.md](../../docs/conventions.md#responsive-layout)).
- **The shared pieces first:** `ExpiryChip`, `displayQuantity`,
  `DetailLayout`, `FilterRow`, `EmptyState`, `ListError`, `Reference`,
  `UndoSnackbar`, `PasswordField`, `IconBadge`
  ([conventions.md](../../docs/conventions.md#shared-pieces-for-screens-adr-055)).
- **Each new screen is in SCREENS,** `client/e2e/accessibility.spec.ts`,
  its violations fixed, never excluded; a sentence's link `underline="always"`.
- **No words typed into JSX:** they come from the catalogues, which lint
  holds (ADR-054; [conventions.md](../../docs/conventions.md#adding-text)).
- **A link or `navigate()` to a top-level page passes `OFFER_BACK`**
  (`client/src/lib/offer-back.ts`) as its router state, so the page offers
  Back; the menu, the trail, an "up" link and a move after an action pass
  none ([conventions.md](../../docs/conventions.md#back-from-a-link-inside-the-app)).
- **A dialog's key goes on the component the page renders,** never on
  MUI's `Dialog`, which lint refuses
  ([conventions.md](../../docs/conventions.md#keys-that-rebuild-a-component)).
