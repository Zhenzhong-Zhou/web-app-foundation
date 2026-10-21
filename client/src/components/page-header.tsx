import ArrowBack from '@mui/icons-material/ArrowBack';
import {
  Breadcrumbs,
  Chip,
  type ChipProps,
  IconButton,
  Link,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { type ReactNode, type Ref, useEffect } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { rem } from '../theme/rem';

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
 * Back and up are different, and a detail page offers both. The trail is
 * up: where this page sits, whatever led here. The arrow beside the title is
 * back: where you actually were. They genuinely differ — arriving at a lot
 * from a run, the trail leads to the lot search, while back returns to the
 * run.
 *
 * Back was first left to the browser, as duplication. Using the app showed
 * otherwise: in a tool that looks like a desktop program, the browser's
 * button is easy to forget, and reaching for the trail instead lands
 * somewhere you never were.
 *
 * The current page appears last and is deliberately not a link. A link to
 * where you already are is a control that does nothing.
 */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  status,
  actions,
  headingRef,
}: {
  /** Ancestors only, nearest last. The current page comes from `title`. */
  crumbs: Crumb[];
  title: string;
  subtitle?: ReactNode;
  status?: { label: string; color: ChipProps['color'] };
  /** Buttons as a fragment, not a row of their own, so they wrap here. */
  actions?: ReactNode;
  /**
   * For a page that moves focus to its title, where the page begins, once
   * an action has taken away the button that had it: Remove a member,
   * Delete a role (ADR-080), as Home does for a card dismissed.
   */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const intl = useIntl();
  // The product's name, not a word: it stays as it is in every language.
  const section = crumbs[0]?.label ?? 'Foundation';

  const navigate = useNavigate();
  const location = useLocation();

  /**
   * Back through this app's own history when there is some; up to the
   * nearest ancestor when there is not. The router gives the first entry of a
   * session the key 'default' — a page opened in a new tab or reloaded — and
   * going back from there would leave the app, to a blank tab or another
   * site. Up is the next best answer to "take me back".
   */
  function goBack() {
    if (location.key !== 'default') {
      void navigate(-1);
      return;
    }

    const parent = crumbs.at(-1);
    if (parent) void navigate(parent.to);
  }

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

  const back = intl.formatMessage({
    id: 'components.pageHeader.back',
    defaultMessage: 'Back',
  });

  return (
    <Stack spacing={1}>
      {/* No trail on a top-level page: the breadcrumb would be the title
          repeated, which is furniture rather than navigation. */}
      {crumbs.length > 0 && (
        <Breadcrumbs
          aria-label={intl.formatMessage({
            id: 'components.pageHeader.breadcrumb',
            defaultMessage: 'breadcrumb',
          })}
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

      {/*
       * Title with its status, then actions — two groups that wrap as wholes.
       * The status chip sits against the title because it describes it ("Acme
       * Tablets · finished"); at the far right past the buttons it read as one
       * more control. On a narrow screen the actions drop to their own line
       * instead of squeezing a long product name into a column of words.
       */}
      <Stack
        direction="row"
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 2, rowGap: 1 }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: 'center', flex: `1 1 ${rem(280)}`, minWidth: 0 }}
        >
          {/* Detail pages only: a top-level page is reached from the
              navigation, and has nowhere to go up to. */}
          {crumbs.length > 0 && (
            <Tooltip title={back}>
              <IconButton
                aria-label={back}
                size="small"
                onClick={goBack}
                sx={{ ml: -1 }}
              >
                <ArrowBack fontSize="small" />
              </IconButton>
            </Tooltip>
          )}

          <Typography
            ref={headingRef}
            variant="h5"
            component="h1"
            tabIndex={headingRef ? -1 : undefined}
            sx={{ minWidth: 0, overflowWrap: 'anywhere' }}
          >
            {title}
          </Typography>

          {status && (
            <Chip label={status.label} color={status.color} size="small" />
          )}
        </Stack>

        {/* The actions wrap among themselves too, once on their own line
            they are still wider than a phone: Export, Trace a lot and
            Refresh at a larger text size are. So a page passes its buttons
            as a fragment, each one a child of this row, not in a row of its
            own that would not wrap. */}
        {actions && (
          <Stack
            direction="row"
            useFlexGap
            spacing={1}
            sx={{
              alignItems: 'center',
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
              ml: 'auto',
              maxWidth: '100%',
            }}
          >
            {actions}
          </Stack>
        )}
      </Stack>

      {/* A line of words: a link in it, such as an order's partner, is
          underlined before any hover, so it is told from them without its
          colour (WCAG 1.4.1). Links only: Learn more, a button with Help's
          icon, keeps its own look. */}
      {subtitle && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ '& a.MuiLink-root': { textDecoration: 'underline' } }}
        >
          {subtitle}
        </Typography>
      )}
    </Stack>
  );
}
