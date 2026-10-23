import { Box } from '@mui/material';

/**
 * The longest reference kept whole: about what a phone's narrowest line
 * holds beside a status at Larger text. A longer one may break at a hyphen,
 * which beats running off the screen (WCAG 1.4.10). Our numbers and the
 * demo's codes run to 13; a SKU or a lot code may run to 64.
 */
const LONGEST = 16;

/**
 * A document's number, a SKU or a lot code with words beside it, kept whole
 * (ADR-081): the line breaks between it and its words, never at its own
 * hyphen, so SO-DEMO-1 never ends a line as SO- with DEMO-1 below. Pass it
 * as a message's value, `{ sku: <Reference>{sku}</Reference> }`, since each
 * language puts the value where it needs. One alone, or first in its line,
 * needs none: the line cannot break before it.
 *
 * white-space: nowrap rather than an inline block, which Chrome reads as a
 * word of its own ("Void INV-1 ?"); and never U+2011, the non-breaking
 * hyphen, since a copied reference must paste into the lookup as typed.
 */
export function Reference({
  children,
}: {
  children: string | null | undefined;
}) {
  if (!children || children.length > LONGEST) return children;
  return (
    <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
      {children}
    </Box>
  );
}

/**
 * A word with a hyphen in it. A word ends at a space, and at Chinese text and
 * its punctuation, which break between any two characters, so a code beside
 * Chinese is kept whole without the sentence: 许可证 LIC-1（Health Canada）.
 */
const HYPHENATED =
  /([^\s\p{Script=Han}\u3000-\u303f\uff00-\uffef]*-[^\s\p{Script=Han}\u3000-\u303f\uff00-\uffef]*)/u;

/**
 * Words the server finished, where nothing marks which is the reference: a
 * notification's title, a Home row's detail, the audit log, a toast, a
 * refusal. Each word with a hyphen in it is kept whole as a Reference, so a
 * date (2026-10-22) and a hyphenated name (Saint-Laurent) are too, which
 * loses them nothing.
 */
export function ReferencesWhole({ text }: { text: string }) {
  // split() with a capturing group puts each match at an odd index.
  return text
    .split(HYPHENATED)
    .map((part, index) =>
      index % 2 ? <Reference key={index}>{part}</Reference> : part,
    );
}
