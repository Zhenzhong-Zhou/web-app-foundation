import { Link } from '@mui/material';
import type { MouseEvent } from 'react';
import { useIntl } from 'react-intl';

/** The id of the page's main landmark, where the skip link sends focus. */
export const MAIN_CONTENT_ID = 'main-content';

/**
 * The first Tab stop on every signed-in page (WCAG 2.4.1, #121): past the
 * rail, the lookup, the bell and the account, straight to the page. Out of
 * sight until it has focus, then at the top left, above everything.
 *
 * Focus moves by hand rather than by following the link, so the address
 * stays as it was and the router never sees a hash it would treat as a new
 * location. The href is still there for what a link is expected to have.
 */
export function SkipLink() {
  const intl = useIntl();

  function skip(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    document.getElementById(MAIN_CONTENT_ID)?.focus();
  }

  return (
    <Link
      href={`#${MAIN_CONTENT_ID}`}
      onClick={skip}
      className="no-print"
      sx={{
        position: 'fixed',
        top: 8,
        left: 8,
        zIndex: 'tooltip',
        px: 2,
        py: 1,
        borderRadius: 1,
        bgcolor: 'background.paper',
        boxShadow: 3,
        fontWeight: 600,
        transform: 'translateY(calc(-100% - 16px))',
        '&:focus': { transform: 'none' },
      }}
    >
      {intl.formatMessage({
        id: 'layout.skipToContent',
        defaultMessage: 'Skip to content',
      })}
    </Link>
  );
}
