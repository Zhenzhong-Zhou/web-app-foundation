const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * For anything a user typed that lands in an HTML email.
 *
 * A name is the obvious case. An admin can create a member with any name and
 * the system then mails that member from its own verified domain — so an
 * unescaped `<a href>` in the name is a phishing link wearing our sender
 * reputation. Five characters, no dependency: this is text into markup, not
 * sanitising markup, which would be a different and much larger problem.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}
