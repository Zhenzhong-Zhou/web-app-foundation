---
paths:
  - "client/src/theme/**"
  - "client/src/**/*.tsx"
  - "client/e2e/{accessibility,text-size}.spec.ts"
---

# The look: the code rules, for Claude

It loads when Claude reads, writes or edits a file its `paths` match.

What to keep true when a component styles itself (ADR-055;
[conventions.md, The look](../../docs/conventions.md#the-look-adr-055)).

- **A screen follows the design language,** `docs/design-language.md`
  (ADR-090): its principles and patterns at each width class. A pattern a
  screen needs and it lacks is added there first, with an amendment of
  ADR-090, as the pull request's first commit.
- **Colours, sizes and corners come from `client/src/theme/tokens.ts`**
  through the theme, asked by name; never a hex value, a font size or a
  radius the tokens name. A value they lack becomes a token first, and a
  new token adds its pair to `tokens.test.ts`.
- **A colour given as a path goes in `sx`;** a `color` prop takes only a
  name. Lint refuses a path there (`client/eslint.config.js`), but cannot
  follow one kept in a variable.
- **Status is a tone:** `StatusChip` with a row in `STATUS_TONES`
  (`client/src/theme/status.ts`), the words carrying the meaning.
- **Five type sizes,** `h5`, `h6`, `body1`, `body2` and `caption`, and
  `TYPE.figure` for a count; no capitals. A font size is rem through the
  theme, never px; a width beside text is `rem(px)` (`client/src/theme/rem.ts`, ADR-075).
- **One filled button per group;** a control's height is the theme's
  density, and an outline is never removed.
- **Breakpoint props where a layout breaks;** what shows is CSS `display`
  at the breakpoint, not a `useMediaQuery` branch
  ([conventions.md, Responsive layout](../../docs/conventions.md#responsive-layout)).
- **The shared pieces before a new one:** `ExpiryChip`, `displayQuantity`,
  `DetailLayout`, `FilterRow`, `EmptyState`, `ListError`, `Reference`,
  `UndoSnackbar`, `PasswordField`, `IconBadge`
  ([conventions.md, Shared pieces for screens](../../docs/conventions.md#shared-pieces-for-screens-adr-055)).
- **A new screen gets its line in SCREENS** in
  `client/e2e/accessibility.spec.ts`; a violation is fixed, never
  excluded. A link inside a sentence is `underline="always"`.
- **No words typed into JSX:** they come from the catalogues, which lint
  holds (ADR-054; [conventions.md, Adding text](../../docs/conventions.md#adding-text)).
- **A link inside the app to a top-level page passes `OFFER_BACK`**
  (`client/src/lib/offer-back.ts`) as its router state, `navigate(to, {
  state: OFFER_BACK })` in code, so the page offers Back. The menu,
  the trail, an "up" link and a move after an action, such as a delete,
  pass none ([conventions.md, Back from a link inside the app](../../docs/conventions.md#back-from-a-link-inside-the-app)).
- **A dialog's key goes on the component the page renders,** never on MUI's `Dialog` inside it, which lint refuses ([conventions.md, Keys that rebuild a component](../../docs/conventions.md#keys-that-rebuild-a-component)).
