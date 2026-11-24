import type { Invitation } from '../api/types.gen';

/** A note from the inviter, plain text (ADR-077). */
export const NOTE_MAX_LENGTH = 500;

/**
 * Where the dialog stands: the form; the link, once copied, to send
 * yourself; or an email that did not go, with the ways on.
 */
export type InviteView =
  | { kind: 'form' }
  | {
      kind: 'copied';
      invitation: Invitation;
      link: string;
      /**
       * How the link it replaces had gone, emailed or copied, which no
       * longer works; null when none was out.
       */
      replaces: 'emailed' | 'copied' | null;
      /** Whether the clipboard took it, or the field is to be copied. */
      copied: boolean;
    }
  | { kind: 'notSent'; invitation: Invitation };
