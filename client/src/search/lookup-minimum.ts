/** The server's minimum, after trimming (ADR-056). */
const MIN_LENGTH = 2;

/** One Chinese character and nothing else: 鱼, 胶. */
const ONE_HAN = /^\p{Script=Han}$/u;

/**
 * Whether the lookup asks for this text: at least two characters, or one
 * Chinese character, the server's rule (server/src/common/search.ts,
 * lookupLongEnough), so the box never asks for what it would refuse.
 */
export function lookupLongEnough(raw: string): boolean {
  const text = raw.trim();
  return text.length >= MIN_LENGTH || ONE_HAN.test(text);
}
