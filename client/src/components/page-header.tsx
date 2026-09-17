import { Breadcrumbs, Chip, Link, Stack, Typography } from '@mui/material';
import { type ReactNode, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';

interface Crumb {
  label: string;
  to: string;
}

/**
 * The top of every detail page: where you are, what this is, and what you can
 * do to it.
 *
 * Shared because the three detail pages had grown three conventions for the
 * same thing — "Orders", "← Products", "← Production" — and a fourth was about
 * to appear. The arrow is dropped: breadcrumbs read as a path, and an arrow
 * inside one implies going back rather than up.
 *
 * Which is the distinction this exists to keep. Back is the browser's job and
 * duplicating it is noise. Up is structural, and the two genuinely differ here
 * — duplicating an order lands you on the new draft, so browser-back returns
 * to the original while this returns to the list.
 *
 * The current page appears last and is deliberately not a link. A link to
 * where you already are is a control that does nothing.
 */
export function PageHeader({
  crumbs,
  title,
  titleTo,
  subtitle,
  status,
  actions,
}: {
  /** Ancestors only, nearest last. The current page comes from `title`. */
  crumbs: Crumb[];
  title: string;
  /** When the title itself points somewhere — an order's partner, say. */
  titleTo?: string;
  subtitle?: ReactNode;
  status?: { label: string; color: 'default' | 'primary' | 'success' };
  actions?: ReactNode;
}) {
  const section = crumbs[0]?.label ?? 'Foundation';

  /**
   * The tab, and therefore the browser's own history and any bookmark. Without
   * this every page in the app is called the same thing, which makes a list of
   * open tabs useless — and browser history is the one navigation surface this
   * component cannot provide.
   */
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · ${section}`;

    return () => {
      document.title = previous;
    };
  }, [title, section]);

  return (
    <Stack spacing={1}>
      {/* No trail on a top-level page: the breadcrumb would be the title
          repeated, which is furniture rather than navigation. */}
      {crumbs.length > 0 && (
        <Breadcrumbs
          aria-label="breadcrumb"
          maxItems={4}
          itemsAfterCollapse={2}
        >
          {crumbs.map((crumb) => (
            <Link
              key={crumb.to}
              component={RouterLink}
              to={crumb.to}
              variant="body2"
              underline="hover"
              color="inherit"
            >
              {crumb.label}
            </Link>
          ))}

          {/* Present but not a link, so the path is complete and the current
              page is visibly where you are. */}
          <Typography variant="body2" color="text.primary">
            {title}
          </Typography>
        </Breadcrumbs>
      )}

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          {titleTo ? (
            // underline="hover" and inherited colour: MUI underlines links
            // always, which makes a heading read as body text.
            <Link
              component={RouterLink}
              to={titleTo}
              underline="hover"
              color="inherit"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </Typography>

        {actions}

        {status && <Chip label={status.label} color={status.color} />}
      </Stack>

      {subtitle && (
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
}
