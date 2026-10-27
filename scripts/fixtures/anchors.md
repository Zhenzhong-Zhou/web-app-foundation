# Anchors, made by markdownlint and by check-docs.mjs alike

<!-- markdownlint-disable-file MD024 -->

Not documentation: each heading below has a shape whose anchor is easy
to make wrongly, and the list links each one from within this file.
markdownlint's MD051 follows those links by its anchors and
`scripts/check-docs.mjs` by its own, both on every run, so a difference
between the two fails at once (ADR-086). A heading shape the list does
not show yet joins it here. MD024 is off for this file alone, since it
repeats a heading on purpose.

- [An em dash](#adr-082--the-products-brand)
- [Apostrophes, straight and curly](#words-youll-meet-and-dont-forget)
- [Backticks](#verify-scriptsverifyshs-own-header)
- [Underscores, as emphasis and in a word](#the-first-and-snake_case)
- [Underscores in code](#the-_private_-field)
- [Chinese](#品牌)
- [A stray less-than sign](#when-a--b)
- [A repeated heading](#notes), [and its repeat](#notes-1)

## ADR-082 — The product's brand

## Words you’ll meet, and don't forget

## Verify (`scripts/verify.sh`'s own header)

## The _first_ and snake_case

## The `_private_` field

## 品牌

## When a < b

## Notes

## Notes
