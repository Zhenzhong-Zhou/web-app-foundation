---
status: accepted
date: 2026-09-02
amended-by: [ADR-055]
---

# ADR-021 — Material UI as the component library

**Context.** Five auth forms exist as unstyled semantic markup, and step 7
adds three more screens. Hand-building components was tried on a previous
project and the component work, not the application logic, was what took the
time.

Three shapes were considered: plain CSS with custom properties, a utility
framework, and a component library. The deciding factor is that this
foundation's surface is a logged-in dashboard — tables, forms, dialogs, menus
— which is exactly the inventory a component library ships and exactly what is
slowest to build by hand.

**Decision.** Material UI, with CSS theme variables and three color modes
(light, dark, system).

Refine is expected at step 9 for admin CRUD, and is **headless** — it supplies
hooks, not components. The two compose rather than compete: MUI renders,
Refine fetches. Choosing MUI now does not foreclose that.

**Consequence.** One component library, so consistency is structural rather
than a convention to maintain. `colorSchemeSelector: 'class'` means mode
changes swap a class on the root element instead of re-rendering the tree.

Cost: MUI is a large dependency and Emotion is runtime CSS-in-JS. Accepted
because the entire surface sits behind a login wall, where a user loads the
bundle once per session and first paint is not a conversion metric. This is
the assumption that would have to be revisited, not the library choice.

**A public marketing surface is a separate deployment, not a route here.**
Landing pages need SEO and fast first paint; this bundle serves neither and
should not try. Such a site shares design tokens — colors, type scale,
spacing — and no components, and lands on its own domain or path. ADR-007
rejected coupling the API to a frontend framework; this is the same boundary
seen from the other side.

If runtime CSS-in-JS ever does become a measured problem, MUI lists
`@mui/material-pigment-css` as an optional peer — a zero-runtime engine that
compiles to static CSS. That is a swap, not a rewrite, which is part of why
this choice is reversible enough to make now.
