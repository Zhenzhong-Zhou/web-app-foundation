import { Accessibility, AutoScroller } from '@dnd-kit/dom';
import { DragDropProvider, type DragEndEvent } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import Add from '@mui/icons-material/Add';
import ArrowDownward from '@mui/icons-material/ArrowDownward';
import ArrowUpward from '@mui/icons-material/ArrowUpward';
import DragIndicator from '@mui/icons-material/DragIndicator';
import LockOutlined from '@mui/icons-material/LockOutlined';
import TuneOutlined from '@mui/icons-material/TuneOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import {
  Box,
  Button,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material';
import {
  type ComponentProps,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  defineMessages,
  type IntlShape,
  type MessageDescriptor,
  useIntl,
} from 'react-intl';

import { FormError } from '../components/form-error';
import { IconBadge } from '../components/icon-badge';
import { StatusChip } from '../components/status-chip';
import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import type { HomeKind } from '../lib/api-names';
import { HIDDEN } from '../lib/hidden';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useUnsavedChanges } from '../lib/use-unsaved-changes';
import { TOUCH } from '../theme/media';
import { rem } from '../theme/rem';
import { FIXED_OPACITY, RADIUS } from '../theme/tokens';
import {
  type Arrangement,
  hide,
  moved,
  placed,
  show,
  shownOf,
} from './arrangement';
import { BADGE, CARDS, type KnownCard, tileWords } from './home-cards';
import { TONAL } from './tonal';

const CUSTOMISE = defineMessages({
  open: { id: 'home.customise.open', defaultMessage: 'Customise Home' },
  reset: { id: 'home.customise.reset', defaultMessage: 'Reset to default' },
  done: { id: 'home.customise.done', defaultMessage: 'Done' },
});

const WORDS = defineMessages({
  intro: {
    id: 'home.customise.intro',
    defaultMessage:
      'Drag a tile by its handle, or use Up and Down to arrange them; hide the ones you never need. It changes only your Home, on every device.',
  },
  keyboard: {
    id: 'home.customise.keyboard',
    defaultMessage:
      'With the keyboard: Tab to a handle, Space to pick it up, the arrows to move it, Space to drop it.',
  },
  draggable: { id: 'home.customise.draggable', defaultMessage: 'draggable' },
  instructions: {
    id: 'home.customise.instructions',
    defaultMessage:
      'To pick up a tile, press Space. Move it with the arrow keys, then press Space to drop it in its new place, or Escape to put it back.',
  },
  fixed: { id: 'home.customise.fixed', defaultMessage: 'Fixed, cannot move' },
  up: { id: 'home.customise.up', defaultMessage: 'Up' },
  down: { id: 'home.customise.down', defaultMessage: 'Down' },
  hide: { id: 'home.customise.hide', defaultMessage: 'Hide' },
  show: { id: 'home.customise.show', defaultMessage: 'Show' },
  hiddenTiles: {
    id: 'home.customise.hiddenTiles',
    defaultMessage: 'Hidden tiles',
  },
  recent: {
    id: 'home.customise.recent',
    defaultMessage: 'Show Recently opened on Home',
  },
  resetNow: {
    id: 'home.customise.resetNow',
    defaultMessage: 'Back to the default order, not saved yet',
  },
});

/** With values, so each takes them: what is heard. */
const VALUED = defineMessages<
  | 'place'
  | 'hiddenNow'
  | 'shownNow'
  | 'handle'
  | 'upOf'
  | 'downOf'
  | 'hideOf'
  | 'showOf'
  | 'pickedUp'
  | 'dropped'
  | 'cancelled'
>({
  place: {
    id: 'home.customise.place',
    defaultMessage: '{name}, {place} of {total}',
  },
  hiddenNow: {
    id: 'home.customise.hiddenNow',
    defaultMessage: '{name} hidden: under Hidden tiles, below',
  },
  shownNow: {
    id: 'home.customise.shownNow',
    defaultMessage: '{name} shown, {place} of {total}',
  },
  handle: { id: 'home.customise.handle', defaultMessage: 'Drag {name}' },
  // Each button's name for a screen reader, its tile in it as the
  // handle's is; on screen its word alone.
  upOf: { id: 'home.customise.upOf', defaultMessage: 'Move {name} up' },
  downOf: { id: 'home.customise.downOf', defaultMessage: 'Move {name} down' },
  hideOf: { id: 'home.customise.hideOf', defaultMessage: 'Hide {name}' },
  showOf: { id: 'home.customise.showOf', defaultMessage: 'Show {name}' },
  pickedUp: {
    id: 'home.customise.pickedUp',
    defaultMessage: 'Picked up {name}, {place} of {total}',
  },
  dropped: {
    id: 'home.customise.dropped',
    defaultMessage: '{name} dropped, {place} of {total}',
  },
  cancelled: {
    id: 'home.customise.cancelled',
    defaultMessage: 'Move cancelled: {name} back at {place} of {total}',
  },
});

/**
 * Each fixed part's name, before its lock's words, for a screen reader:
 * what it marks has left what one reads while Home is customised, so the
 * lock says which part stays (WCAG 1.3.1).
 */
const PARTS = defineMessages({
  greeting: { id: 'home.customise.part.greeting', defaultMessage: 'Greeting:' },
  welcome: { id: 'home.customise.part.welcome', defaultMessage: 'Welcome:' },
  start: {
    id: 'home.customise.part.start',
    defaultMessage: 'Getting started:',
  },
  late: { id: 'home.customise.part.late', defaultMessage: 'What is late:' },
});

/** Under the top bar, where the page scrolls; never on a short window. */
const STICKY = {
  '@media (min-height: 700px)': {
    position: 'sticky',
    top: 'var(--bar-height, 0px)',
    zIndex: 1,
  },
} as const;

/**
 * What may not move, while Home is customised (the design language,
 * Arranging your own screen): in view, faded, and not to be used meanwhile,
 * with a lock and words saying it stays, the part named for a screen
 * reader; without a part, no lock. Outside it, as it is.
 */
export function Fixed({
  on,
  part,
  children,
}: {
  on: boolean;
  part?: keyof typeof PARTS;
  children: ReactNode;
}) {
  const intl = useIntl();
  return (
    <Box>
      {on && part && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <Box component="span" sx={HIDDEN}>
            {intl.formatMessage(PARTS[part])}
          </Box>
          <StatusChip
            tone="warning"
            label={intl.formatMessage(WORDS.fixed)}
            icon={<LockOutlined />}
          />
        </Box>
      )}
      <Box inert={on} sx={on ? { opacity: FIXED_OPACITY } : undefined}>
        {children}
      </Box>
    </Box>
  );
}

/**
 * The button that opens it, at the right of "What needs you today", beside
 * the tiles it changes, at every width (ADR-091, amended November 2026).
 */
export function CustomiseButton({
  ref,
  onClick,
}: {
  ref: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  const intl = useIntl();
  return (
    <Button
      ref={ref}
      variant="text"
      color="inherit"
      startIcon={<TuneOutlined />}
      onClick={onClick}
      // Right-aligned on a line of its own where the heading leaves it no
      // room (the design language, Headings and their actions).
      sx={[TONAL, { ml: 'auto' }]}
    >
      {intl.formatMessage(CUSTOMISE.open)}
    </Button>
  );
}

/**
 * Customise Home (ADR-091, amended November 2026; the design language,
 * Arranging your own screen), in place of the tiles: each tile a card with
 * its handle, its count, and Up, Down and Hide; the hidden ones below, each
 * with Show; Recently opened's switch; Reset to default and Done in a row
 * that stays at the top while the page scrolls. Every change is on the
 * page until Done saves it, and none can be made while it does. A tile
 * drags by its handle, by a pointer, by touch after a press and hold, or by
 * the keyboard. Opened, focus goes to its heading. After Up or Down focus
 * stays on the moved tile's button, after Hide it goes to the next tile's
 * handle, after Show to the shown tile's, after a drop by the keyboard on
 * its handle, and a screen reader hears each move ("To ship, 2 of 8").
 */
export function CustomiseHome({
  cards,
  arrangement,
  changed,
  onChange,
  onReset,
  onDone,
  saving,
  error,
}: {
  cards: readonly KnownCard[];
  arrangement: Arrangement;
  /** Whether it differs from Home as it came, which leaving keeps. */
  changed: boolean;
  onChange: (next: Arrangement) => void;
  onReset: () => void;
  onDone: () => void;
  saving: boolean;
  /** Why Done's save failed, worded as the page renders. */
  error: string | null;
}) {
  const intl = useIntl();
  const id = useId();
  const { warning: expiringWithin } = useExpiryDays();
  const [said, setSaid] = useState('');
  // Leaving with changes not saved asks first (Unsaved work).
  const { blocker } = useUnsavedChanges(changed);
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  // Each button by its tile and what it does, `data-focus="toShip.up"`,
  // for focus after a change.
  const button = (key: string) =>
    panel.current?.querySelector<HTMLElement>(`[data-focus="${key}"]`) ?? null;
  const focusNext = useRef<string | null>(null);
  // Where a moved tile's card was on the screen, for the page to follow.
  const followFrom = useRef<number | null>(null);
  const row = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const key = focusNext.current;
    if (!key) return;
    focusNext.current = null;
    const from = followFrom.current;
    followFrom.current = null;
    const target = button(key);
    if (!target) return;
    const card = target.closest('li') ?? target;
    // The page follows a moved card, so the button under a finger is still
    // its own: a second tap moves it again, not the tile in its old place.
    if (from !== null) {
      scrollBy(card.getBoundingClientRect().top - from);
    }
    target.focus({ preventScroll: true });
    inView(card, row.current);
  });

  const byKind = new Map(cards.map((card) => [card.kind, card]));
  const known = (kind: HomeKind) => byKind.has(kind);
  const shown = shownOf(arrangement).filter(known);
  const hidden = arrangement.order.filter(
    (kind) => known(kind) && arrangement.hidden.includes(kind),
  );
  const titleOf = (kind: HomeKind) =>
    tileWords(intl, byKind.get(kind)!, expiringWithin).title;

  const plugins = useMemo(() => draggingPlugins(intl), [intl]);

  /** A drop: the tile in the place it was dropped, unless cancelled. */
  function dropped(event: DragEndEvent) {
    // The library says where a drop put it; the line says no older move.
    setSaid('');
    const { source, activatorEvent } = event.operation;
    if (event.canceled || !isSortable(source)) return;
    const kind = source.id as HomeKind;
    const next = placed(arrangement, kind, source.index);
    if (next === arrangement) return;
    // The keyboard stays on the handle it dropped with.
    if (activatorEvent instanceof KeyboardEvent) {
      focusNext.current = `${kind}.handle`;
    }
    onChange(next);
  }

  function sayPlace(
    next: Arrangement,
    kind: HomeKind,
    message: MessageDescriptor = VALUED.place,
  ) {
    const list = shownOf(next).filter(known);
    setSaid(
      intl.formatMessage(message, {
        name: titleOf(kind),
        place: list.indexOf(kind) + 1,
        total: list.length,
      }),
    );
  }

  function move(kind: HomeKind, by: -1 | 1) {
    const next = moved(arrangement, kind, by);
    if (next === arrangement) return;
    focusNext.current = `${kind}.${by < 0 ? 'up' : 'down'}`;
    followFrom.current =
      button(focusNext.current)?.closest('li')?.getBoundingClientRect().top ??
      null;
    onChange(next);
    sayPlace(next, kind);
  }

  // On the next tile's handle, not its Hide, so a second Enter does not
  // hide that one too.
  function hideTile(kind: HomeKind) {
    const at = shown.indexOf(kind);
    const after = shown[at + 1] ?? shown[at - 1];
    focusNext.current = after ? `${after}.handle` : `${kind}.show`;
    onChange(hide(arrangement, kind));
    setSaid(intl.formatMessage(VALUED.hiddenNow, { name: titleOf(kind) }));
  }

  // On the tile shown, where it now is.
  function showTile(kind: HomeKind) {
    focusNext.current = `${kind}.handle`;
    const next = show(arrangement, kind);
    onChange(next);
    sayPlace(next, kind, VALUED.shownNow);
  }

  return (
    <Paper
      ref={panel}
      component="section"
      aria-labelledby={`${id}-title`}
      variant="outlined"
      sx={{
        p: 2,
        pt: 0,
        border: 2,
        borderColor: 'primary.main',
        borderRadius: `${RADIUS.panel}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Reset to default and Done in reach while the page scrolls. */}
      <Box
        ref={row}
        sx={{
          ...STICKY,
          mx: -2,
          px: 2,
          py: 1.5,
          bgcolor: 'background.paper',
          borderTopLeftRadius: `${RADIUS.panel}px`,
          borderTopRightRadius: `${RADIUS.panel}px`,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1,
        }}
      >
        <Typography
          ref={heading}
          variant="h6"
          component="h2"
          id={`${id}-title`}
          tabIndex={-1}
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <TuneOutlined aria-hidden fontSize="small" />
          {intl.formatMessage(CUSTOMISE.open)}
        </Typography>
        {/* Held while Done saves, not `disabled`, which would drop focus
            to the page: after a failed save the keyboard is still on
            Done. The class draws them as MUI draws a disabled button. */}
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="text"
            color="inherit"
            aria-disabled={saving || undefined}
            className={saving ? 'Mui-disabled' : undefined}
            sx={TONAL}
            onClick={
              saving
                ? undefined
                : () => {
                    onReset();
                    setSaid(intl.formatMessage(WORDS.resetNow));
                  }
            }
          >
            {intl.formatMessage(CUSTOMISE.reset)}
          </Button>
          <Button
            variant="contained"
            aria-disabled={saving || undefined}
            className={saving ? 'Mui-disabled' : undefined}
            onClick={saving ? undefined : onDone}
          >
            {saving
              ? intl.formatMessage({
                  id: 'common.saving',
                  defaultMessage: 'Saving…',
                })
              : intl.formatMessage(CUSTOMISE.done)}
          </Button>
        </Stack>
        {/* What the last change did, where it is seen while the page
            scrolls, and heard: a tile's new place, where a hidden one
            went, a reset not saved yet. Its line kept while empty, so
            the cards below do not jump when it fills. */}
        <Typography
          role="status"
          variant="body2"
          sx={{ flexBasis: '100%', minHeight: rem(24) }}
        >
          {said}
        </Typography>
      </Box>

      {/* Out of use while Done saves, so no move is made that the save
          would not hold. */}
      <Box
        inert={saving}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}
      >
        <Box>
          <Typography sx={{ color: 'text.secondary' }}>
            {intl.formatMessage(WORDS.intro)}
          </Typography>
          {/* The keyboard's keys, not on a touch screen, where they are no
              use; a screen reader hears the same from each handle's
              description, the library's instructions. */}
          <Typography
            variant="body2"
            sx={{ color: 'text.secondary', [TOUCH]: { display: 'none' } }}
          >
            {intl.formatMessage(WORDS.keyboard)}
          </Typography>
        </Box>

        {error && <FormError message={error} />}

        <DragDropProvider plugins={plugins} onDragEnd={dropped}>
          <Box
            component="ol"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              display: 'grid',
              gap: 1.5,
              // One across on a phone, two on a tablet, three on a laptop:
              // each card wide enough for its three buttons.
              gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${rem(280)}), 1fr))`,
            }}
          >
            {shown.map((kind, index) => {
              const words = tileWords(intl, byKind.get(kind)!, expiringWithin);
              const Icon = CARDS[kind].icon;
              const nameId = `${id}-${kind}`;
              return (
                <DraggableTile
                  key={kind}
                  kind={kind}
                  index={index}
                  total={shown.length}
                  name={words.title}
                  nameId={nameId}
                  actions={
                    <>
                      <EdgeButton
                        focus={`${kind}.up`}
                        label={intl.formatMessage(VALUED.upOf, {
                          name: words.title,
                        })}
                        edge={index === 0}
                        icon={<ArrowUpward />}
                        onClick={() => move(kind, -1)}
                      >
                        {intl.formatMessage(WORDS.up)}
                      </EdgeButton>
                      <EdgeButton
                        focus={`${kind}.down`}
                        label={intl.formatMessage(VALUED.downOf, {
                          name: words.title,
                        })}
                        edge={index === shown.length - 1}
                        icon={<ArrowDownward />}
                        onClick={() => move(kind, 1)}
                      >
                        {intl.formatMessage(WORDS.down)}
                      </EdgeButton>
                      <EdgeButton
                        focus={`${kind}.hide`}
                        label={intl.formatMessage(VALUED.hideOf, {
                          name: words.title,
                        })}
                        icon={<VisibilityOffOutlined />}
                        onClick={() => hideTile(kind)}
                      >
                        {intl.formatMessage(WORDS.hide)}
                      </EdgeButton>
                    </>
                  }
                >
                  <IconBadge size={36} sx={BADGE[words.tone]}>
                    <Icon fontSize="small" />
                  </IconBadge>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography id={nameId} sx={{ fontWeight: 600 }}>
                      {words.title}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary' }}
                    >
                      {words.summary}
                    </Typography>
                  </Box>
                </DraggableTile>
              );
            })}
          </Box>
        </DragDropProvider>

        {hidden.length > 0 && (
          <Box
            component="section"
            aria-labelledby={`${id}-hidden`}
            sx={{
              p: 1.5,
              border: 1,
              borderStyle: 'dashed',
              borderColor: 'divider',
              borderRadius: `${RADIUS.panel}px`,
              bgcolor: 'background.default',
            }}
          >
            <Typography
              variant="body1"
              component="h3"
              id={`${id}-hidden`}
              sx={{ fontWeight: 600, mb: 1 }}
            >
              {intl.formatMessage(WORDS.hiddenTiles)}
            </Typography>
            <Box
              component="ul"
              sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1 }}
            >
              {hidden.map((kind) => {
                const Icon = CARDS[kind].icon;
                const nameId = `${id}-${kind}`;
                return (
                  <Box
                    component="li"
                    key={kind}
                    aria-labelledby={nameId}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}
                  >
                    <IconBadge size={36} sx={BADGE.quiet}>
                      <Icon fontSize="small" />
                    </IconBadge>
                    <Typography id={nameId} sx={{ flex: 1, minWidth: 0 }}>
                      {titleOf(kind)}
                    </Typography>
                    <EdgeButton
                      focus={`${kind}.show`}
                      label={intl.formatMessage(VALUED.showOf, {
                        name: titleOf(kind),
                      })}
                      icon={<Add />}
                      onClick={() => showTile(kind)}
                    >
                      {intl.formatMessage(WORDS.show)}
                    </EdgeButton>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}

        <Paper variant="outlined" sx={{ px: 2 }}>
          <FormControlLabel
            labelPlacement="start"
            control={
              <Switch
                checked={arrangement.recent}
                onChange={(event) =>
                  onChange({ ...arrangement, recent: event.target.checked })
                }
              />
            }
            label={intl.formatMessage(WORDS.recent)}
            sx={{
              m: 0,
              width: '100%',
              minHeight: 48,
              justifyContent: 'space-between',
              gap: 1,
              [TOUCH]: { minHeight: 56 },
            }}
          />
        </Paper>
      </Box>

      <UnsavedChangesDialog
        blocker={blocker}
        message={intl.formatMessage({
          id: 'home.customise.unsaved',
          defaultMessage: 'Your changes to Home aren’t saved yet.',
        })}
      />
    </Paper>
  );
}

/** Space kept between a card brought into view and what is around it. */
const MARGIN = 8;

function scrollBy(top: number) {
  if (top !== 0) window.scrollBy(0, top);
}

/**
 * A card in view after a change: below the top bar and the row that stays
 * at the top while the page scrolls, never under them (WCAG 2.4.11), and
 * above the window's foot.
 */
function inView(card: Element, row: Element | null) {
  const { top, bottom } = card.getBoundingClientRect();
  const bar =
    Number.parseFloat(
      getComputedStyle(card).getPropertyValue('--bar-height'),
    ) || 0;
  const below =
    Math.max(bar, row?.getBoundingClientRect().bottom ?? 0) + MARGIN;
  if (top < below) scrollBy(top - below);
  else if (bottom > window.innerHeight - MARGIN) {
    scrollBy(Math.min(bottom - window.innerHeight + MARGIN, top - below));
  }
}

/** What a tile's card tells the library, for what a screen reader hears. */
interface Spoken extends Record<string, unknown> {
  name: string;
  total: number;
}

/**
 * The page scrolls by itself while a tile is held in the window's top or
 * bottom tenth, half the library's fifth, at under half its speed, and
 * never sideways: so a small wobble picking up a handle near the window's
 * foot no longer carries the tile rows away.
 */
const AUTO_SCROLL = { threshold: { x: 0, y: 0.1 }, acceleration: 10 };

/**
 * The library's own plugins (ADR-091, amended November 2026): its
 * accessibility in the reader's language, what the handle's description
 * says, and what a screen reader hears as a tile is picked up, moved over
 * a place, dropped or put back, by its name and place as Up and Down say
 * it; and its scrolling while a tile is held, gentler.
 */
function draggingPlugins(
  intl: IntlShape,
): ComponentProps<typeof DragDropProvider>['plugins'] {
  const say = (message: MessageDescriptor, data: unknown, index: number) => {
    const { name, total } = data as Spoken;
    return intl.formatMessage(message, { name, place: index + 1, total });
  };
  const options: NonNullable<ConstructorParameters<typeof Accessibility>[1]> = {
    screenReaderInstructions: {
      draggable: intl.formatMessage(WORDS.instructions),
    },
    announcements: {
      dragstart: ({ operation: { source } }) =>
        isSortable(source)
          ? say(VALUED.pickedUp, source.data, source.initialIndex)
          : undefined,
      dragover: ({ operation: { source, target } }) =>
        isSortable(source) && isSortable(target) && target.id !== source.id
          ? say(VALUED.place, source.data, target.index)
          : undefined,
      dragend: ({ operation: { source }, canceled }) => {
        if (!isSortable(source)) return undefined;
        return canceled
          ? say(VALUED.cancelled, source.data, source.initialIndex)
          : say(VALUED.dropped, source.data, source.index);
      },
    },
  };
  const accessibility = Accessibility.configure(options);
  const scrolling = AutoScroller.configure(AUTO_SCROLL);
  return (defaults) =>
    defaults.map((plugin) =>
      plugin === Accessibility
        ? accessibility
        : plugin === AutoScroller
          ? scrolling
          : plugin,
    );
}

/**
 * A tile's card while Home is customised, dragged by its handle (ADR-091,
 * amended November 2026): by a mouse as soon as it is pressed, by touch
 * after a press held a quarter of a second, so a swipe still scrolls the
 * page, by the keyboard with Space, the arrows, Space, and Escape to put
 * it back; the library's defaults, each. Dragged, it lifts with the lift's
 * shadow and an accent edge; where it would drop is a dashed accent box.
 * Under less motion the library slides nothing.
 */
function DraggableTile({
  kind,
  index,
  total,
  name,
  nameId,
  actions,
  children,
}: {
  kind: HomeKind;
  index: number;
  /** How many tiles are shown, for the place a screen reader hears. */
  total: number;
  name: string;
  nameId: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const intl = useIntl();
  // The library's handle ref, one function from draw to draw, so it keeps
  // its hold of a handle while its tile is dragged.
  const { ref, handleRef } = useSortable<Spoken>({
    id: kind,
    index,
    data: { name, total },
  });
  return (
    <Box
      component="li"
      ref={ref}
      aria-labelledby={nameId}
      sx={(theme) => ({
        p: 1.5,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: `${RADIUS.panel}px`,
        bgcolor: 'background.paper',
        // The tile being dragged, which the library marks.
        '&[data-dnd-dragging]': {
          borderColor: 'primary.main',
          boxShadow: theme.vars?.palette.surface.lift,
        },
        // Its place, the library's copy of it, which it hides: drawn as
        // the box it drops into, the same size, its contents unseen.
        '&&[data-dnd-placeholder]': {
          visibility: 'visible',
          m: '-1px',
          border: 2,
          borderStyle: 'dashed',
          borderColor: 'primary.main',
          bgcolor: 'surface.chosen',
          '& > *': { visibility: 'hidden' },
        },
      })}
    >
      <Stack direction="row" sx={{ gap: 1.25, alignItems: 'center' }}>
        <IconButton
          ref={handleRef}
          data-focus={`${kind}.handle`}
          aria-label={intl.formatMessage(VALUED.handle, { name })}
          aria-roledescription={intl.formatMessage(WORDS.draggable)}
          sx={[
            TONAL,
            {
              width: 44,
              height: 44,
              flex: 'none',
              borderRadius: `${RADIUS.control}px`,
              cursor: 'grab',
            },
          ]}
        >
          <DragIndicator fontSize="small" />
        </IconButton>
        {children}
      </Stack>
      <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap' }}>
        {actions}
      </Stack>
    </Box>
  );
}

/**
 * Up, Down, Hide and Show, grey beside the page's one main button. Up on the first tile and
 * Down on the last say they cannot, yet keep focus, so a tile moved to
 * the top still has it on its Up.
 */
function EdgeButton({
  focus,
  label,
  edge = false,
  icon,
  onClick,
  children,
}: {
  /** Its tile and what it does, where focus finds it after a change. */
  focus: string;
  /** What a screen reader hears, its word and its tile: "Move To ship up". */
  label: string;
  edge?: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      data-focus={focus}
      aria-label={label}
      variant="text"
      color="inherit"
      startIcon={icon}
      aria-disabled={edge || undefined}
      onClick={edge ? undefined : onClick}
      sx={[
        TONAL,
        {
          '&[aria-disabled="true"]': {
            color: 'text.disabled',
            cursor: 'default',
            '&:hover': { bgcolor: 'tonal.bg' },
          },
        },
      ]}
    >
      {children}
    </Button>
  );
}
