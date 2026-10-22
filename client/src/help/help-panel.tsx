import CloseIcon from '@mui/icons-material/Close';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import {
  Alert,
  Box,
  Button,
  Dialog,
  GlobalStyles,
  IconButton,
  Link,
  Skeleton,
  Slide,
  Stack,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { useLanguage } from '../i18n/use-language';
import { formatDate } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { rem } from '../theme/rem';
import { useTextSize } from '../theme/text-size';
import { BUILD } from '../version/build';
import { guideGroups } from './guide-groups';
import { GuideView } from './guide-view';
import { type GuideName, GUIDES, loadGuide } from './guides';
import type { HelpState } from './help-context';
import {
  GUIDE_TITLE_ID,
  HELP_HEADING_ID,
  HELP_PANEL_ID,
  sectionElementId,
} from './help-ids';
import { parseGuide } from './markdown';
import { useHelp } from './use-help';

/** The panel's width, in rem so it grows with the text (ADR-075). */
const WIDTH_PX = 420;

/**
 * The least room a page keeps beside Help, about a small laptop's page with
 * the rail folded: with less, Help slides over the page instead.
 */
const PAGE_MIN_PX = 720;

/** A dialog's margin either side of its paper, as MUI draws it. */
const DIALOG_MARGINS = 64;

const M = defineMessages({
  help: { id: 'help.title', defaultMessage: 'Help' },
  close: { id: 'help.close', defaultMessage: 'Close help' },
  allGuides: { id: 'help.allGuides', defaultMessage: 'All guides' },
  failed: {
    id: 'help.failed',
    defaultMessage:
      'This guide could not be opened. Check your connection, then try again.',
  },
});

function rootFontSize(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Whether one of the page's dialogs is open: MUI puts each at the end of
 * <body> as it opens, and takes it away once it has closed.
 */
function subscribeToDialogs(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.body, { childList: true });
  return () => observer.disconnect();
}

const dialogShown = () =>
  document.querySelector('body > .MuiDialog-root') !== null;

/** While Help is closed: nothing to watch, and no dialog to make room for. */
const watchNothing = () => () => undefined;
const noDialog = () => false;

/**
 * The page, and Help beside it or over it (ADR-079). On a computer, Help
 * sits beside the page, which takes the width left, the rail folded to make
 * room while Help is open (the frame does that): nothing of the page is
 * covered, and a control focused in it is never under Help (WCAG 2.4.11).
 * Where that would leave the page less than about 720 px, Help slides over
 * the right of the page instead, with nothing dimmed, so the page still
 * works while the person follows the steps. On a phone, Help is full
 * screen, with Close.
 *
 * The top bar is measured rather than assumed: Help starts under it, at
 * whatever height the text size gives it, and the bar's width is the room
 * the page and the panel share.
 *
 * A dialog the page opens moves into the room beside Help, and Help stays
 * above the dialog's dimming, so the steps can still be read while they
 * are followed inside it. It is to read and scroll, by mouse or touch,
 * and nothing in it can be pressed meanwhile: MUI's dialog keeps the
 * keyboard's focus to itself and hides the rest of the page, Help with
 * it, from assistive technology, so what someone sees beside the dialog is
 * never something they could press that a screen reader could not reach.
 * Where the window leaves no room beside Help for a dialog at its usual
 * width, Help is dimmed with the page, as before.
 */
export function HelpFrame({
  bar,
  children,
}: {
  bar: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const help = useHelp();
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  // A new text size changes the panel's width in px: render again for it.
  useTextSize();
  const [size, setSize] = useState({ height: 56, width: 0, viewport: 0 });
  // Watched only while Help is open: every tooltip, menu and snackbar
  // mounts at the end of <body> too.
  const dialog = useSyncExternalStore(
    help?.open ? subscribeToDialogs : watchNothing,
    help?.open ? dialogShown : noDialog,
  );

  useEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    // The bar's width moves with the window's, so this sees both.
    const observer = new ResizeObserver(() =>
      setSize({
        height: element.offsetHeight,
        width: element.offsetWidth,
        viewport: window.innerWidth,
      }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [bar]);

  const width = (WIDTH_PX / 16) * rootFontSize();
  const beside = !!help?.open && !phone && size.width - width >= PAGE_MIN_PX;
  const roomForDialog =
    !!help?.open &&
    !phone &&
    size.viewport - width >= theme.breakpoints.values.sm + DIALOG_MARGINS;
  const aboveDialog = roomForDialog && dialog;

  return (
    <>
      <Box sx={beside ? { pr: `${width}px` } : undefined}>{children}</Box>

      {/* A dialog centres in the room beside Help, not under it. */}
      {roomForDialog && (
        <GlobalStyles
          styles={{ '.MuiDialog-container': { paddingRight: `${width}px` } }}
        />
      )}

      {help &&
        (phone ? (
          <Dialog
            open={help.open}
            onClose={help.close}
            fullScreen
            aria-labelledby={HELP_HEADING_ID}
            // Focus goes back to what opened Help: the state sees to it.
            disableRestoreFocus
            // Help, as on a computer: no amber line (ADR-081).
            slotProps={{ paper: { component: 'div' } }}
          >
            <PanelBody help={help} phone />
          </Dialog>
        ) : (
          <Slide in={help.open} direction="left" mountOnEnter unmountOnExit>
            <Box
              component="aside"
              id={HELP_PANEL_ID}
              aria-labelledby={HELP_HEADING_ID}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  help.close();
                }
              }}
              sx={{
                position: 'fixed',
                top: size.height,
                right: 0,
                bottom: 0,
                width: `min(${rem(WIDTH_PX)}, 100%)`,
                zIndex: aboveDialog
                  ? theme.zIndex.modal + 1
                  : theme.zIndex.appBar - 1,
                display: 'flex',
                flexDirection: 'column',
                bgcolor: 'background.paper',
                borderLeft: 1,
                borderColor: 'divider',
                // Over the page, a shadow says it floats; beside it, the
                // border is enough.
                boxShadow: beside
                  ? 'none'
                  : '-8px 0 24px rgba(20, 26, 36, 0.14)',
                // Beside a dialog, scrolled and read, never pressed.
                ...(aboveDialog && {
                  '& *': { pointerEvents: 'none' },
                  '& [data-help-scroller]': { pointerEvents: 'auto' },
                }),
              }}
            >
              <PanelBody help={help} phone={false} />
            </Box>
          </Slide>
        ))}
    </>
  );
}

/**
 * The header with Close, the guide, and the list of guides and the version
 * at its foot.
 */
function PanelBody({ help, phone }: { help: HelpState; phone: boolean }) {
  const intl = useIntl();
  const { locale } = useLanguage();
  const { guide, section, request, takeFocusRef } = help;

  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    text: string | null;
  } | null>(null);
  const key = `${guide} ${locale} ${attempt}`;

  useEffect(() => {
    let ignore = false;
    loadGuide(guide, locale).then(
      (text) => {
        if (!ignore) setLoaded({ key, text });
      },
      () => {
        if (!ignore) setLoaded({ key, text: null });
      },
    );
    return () => {
      ignore = true;
    };
  }, [guide, locale, key]);

  const current = loaded?.key === key ? loaded : null;
  const text = current?.text;
  const parsed = useMemo(() => (text ? parseGuide(text) : null), [text]);
  const showSkeleton = useDelayedFlag(!current);

  const scroller = useRef<HTMLDivElement>(null);
  const shown = useRef<GuideName | null>(null);

  /**
   * Once the guide is drawn: the section asked for scrolled into view and
   * marked for a moment, or else the top of a guide newly shown. Focus moves
   * only when the person asked in Help or by a Learn more.
   */
  useEffect(() => {
    const box = scroller.current;
    if (!parsed || !box) return;
    const focus = takeFocusRef.current;
    takeFocusRef.current = false;

    const heading = section
      ? document.getElementById(sectionElementId(section))
      : null;
    if (heading && box.contains(heading)) {
      shown.current = guide;
      box.scrollTop = heading.offsetTop - 8;
      if (focus) heading.focus({ preventScroll: true });
      heading.setAttribute('data-marked', '');
      const timer = window.setTimeout(
        () => heading.removeAttribute('data-marked'),
        1600,
      );
      return () => {
        window.clearTimeout(timer);
        heading.removeAttribute('data-marked');
      };
    }

    if (shown.current !== guide) box.scrollTop = 0;
    shown.current = guide;
    if (focus) {
      document.getElementById(GUIDE_TITLE_ID)?.focus({ preventScroll: true });
    }
  }, [parsed, guide, section, request, takeFocusRef]);

  return (
    <>
      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          gap: 1,
          pl: 2.5,
          pr: 1,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        <Typography
          id={HELP_HEADING_ID}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            flex: 1,
            minWidth: 0,
            color: 'primary.main',
            fontWeight: 600,
          }}
        >
          <HelpOutlineOutlined fontSize="small" aria-hidden />
          {phone
            ? intl.formatMessage(
                {
                  id: 'help.titleWithGuide',
                  defaultMessage: 'Help · {guide}',
                },
                { guide: intl.formatMessage(GUIDES[guide].label) },
              )
            : intl.formatMessage(M.help)}
        </Typography>
        <IconButton
          aria-label={intl.formatMessage(M.close)}
          onClick={help.close}
        >
          <CloseIcon />
        </IconButton>
      </Stack>

      <Box
        ref={scroller}
        data-help-scroller
        sx={{
          position: 'relative',
          flex: 1,
          overflowY: 'auto',
          // Eased, except where less motion is asked for (ADR-075), when
          // it jumps; set by scrollTop, so it eases that too.
          scrollBehavior: 'smooth',
          px: { xs: 2, sm: 2.75 },
          pt: 2.25,
          pb: 3.5,
        }}
      >
        {parsed ? (
          <GuideView guide={parsed} onFollow={help.follow} />
        ) : current ? (
          <Alert
            severity="error"
            action={
              <Button variant="text" onClick={() => setAttempt(attempt + 1)}>
                {intl.formatMessage({
                  id: 'common.tryAgain',
                  defaultMessage: 'Try again',
                })}
              </Button>
            }
          >
            {intl.formatMessage(M.failed)}
          </Alert>
        ) : showSkeleton ? (
          <Stack spacing={1}>
            <Skeleton height={36} width="50%" />
            <Skeleton height={96} />
            <Skeleton height={96} />
          </Stack>
        ) : null}

        <AllGuides help={help} />
        <VersionFoot />
      </Box>
    </>
  );
}

/**
 * The version this tab runs, last, small and grey: what someone helping
 * asks for first, and the build a tab left open is still on (ADR-081).
 */
function VersionFoot() {
  const intl = useIntl();
  return (
    <Typography
      variant="caption"
      component="p"
      color="text.secondary"
      sx={{ mt: 3, pt: 1.5, borderTop: 1, borderColor: 'divider' }}
    >
      {intl.formatMessage(
        {
          id: 'help.version',
          defaultMessage: 'Version {version} · build {build} · {date}',
        },
        {
          version: BUILD.version,
          build: BUILD.build.slice(0, 7),
          date: formatDate(BUILD.builtAt),
        },
      )}
    </Typography>
  );
}

/** The guides for the pages the person can open, shown here when chosen. */
function AllGuides({ help }: { help: HelpState }) {
  const intl = useIntl();
  const can = useCan();

  return (
    <Box
      component="nav"
      aria-labelledby="help-all-guides"
      sx={{ mt: 3, pt: 2, borderTop: 1, borderColor: 'divider' }}
    >
      <Typography
        id="help-all-guides"
        variant="subtitle1"
        component="h3"
        color="text.secondary"
        sx={{ mb: 1 }}
      >
        {intl.formatMessage(M.allGuides)}
      </Typography>
      <Stack spacing={1.5}>
        {guideGroups(can).map((group) => (
          <Box key={group.label.id}>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ fontWeight: 600 }}
            >
              {intl.formatMessage(group.label)}
            </Typography>
            <Box
              component="ul"
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                columnGap: 0.75,
                rowGap: 0.5,
                m: 0,
                p: 0,
                listStyle: 'none',
                // A dot between names, which is not read aloud.
                '& > li + li::before': {
                  content: '"·" / ""',
                  color: 'text.secondary',
                  mr: 0.75,
                },
              }}
            >
              {group.guides.map((name) => (
                <li key={name}>
                  <Link
                    component="button"
                    type="button"
                    aria-current={name === help.guide ? 'true' : undefined}
                    onClick={() => help.show(name)}
                    sx={{
                      font: 'inherit',
                      verticalAlign: 'baseline',
                      fontWeight: name === help.guide ? 600 : undefined,
                    }}
                  >
                    {intl.formatMessage(GUIDES[name].label)}
                  </Link>
                </li>
              ))}
            </Box>
          </Box>
        ))}
        <Typography>
          <FormattedMessage
            id="help.yourAccess"
            defaultMessage="What you can do here is on <link>Your account</link>."
            values={{
              link: (chunks: ReactNode[]) => (
                <Link
                  component={RouterLink}
                  to="/account#your-access"
                  underline="always"
                  onClick={help.follow}
                >
                  {chunks}
                </Link>
              ),
            }}
          />
        </Typography>
      </Stack>
    </Box>
  );
}
