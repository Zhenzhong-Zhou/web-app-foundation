import { Accessibility } from '@dnd-kit/dom';
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
  Alert,
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
  useCallback,
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

import { IconBadge } from '../components/icon-badge';
import { StatusChip } from '../components/status-chip';
import { UnsavedChangesDialog } from '../components/unsaved-changes-dialog';
import type { HomeKind } from '../lib/api-names';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useFailureWords } from '../lib/use-failure-words';
import { useUnsavedChanges } from '../lib/use-unsaved-changes';
import { TOUCH } from '../theme/media';
import { rem } from '../theme/rem';
import { RADIUS } from '../theme/tokens';
import {
  type Arrangement,
  hide,
  moved,
  placed,
  sameArrangement,
  show,
  shownOf,
} from './arrangement';
import { CARDS, type KnownCard, tileWords } from './home-cards';
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
      'Drag a tile, or use Up and Down to arrange them; hide the ones you never need. It changes only your Home, on every device.',
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

/** With values, so each takes them: the card's line and what is heard. */
const VALUED = defineMessages<
  | 'summary'
  | 'place'
  | 'hiddenNow'
  | 'shownNow'
  | 'handle'
  | 'pickedUp'
  | 'dropped'
  | 'cancelled'
>({
  summary: {
    id: 'home.customise.summary',
    defaultMessage: '{count} · {status}',
  },
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
 * with a lock and words saying it stays. Outside it, as it is.
 */
export function Fixed({
  on,
  lock = true,
  children,
}: {
  on: boolean;
  lock?: boolean;
  children: ReactNode;
}) {
  const intl = useIntl();
  return (
    <Box>
      {on && lock && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
          <StatusChip
            tone="warning"
            label={intl.formatMessage(WORDS.fixed)}
            icon={<LockOutlined />}
          />
        </Box>
      )}
      <Box inert={on} sx={on ? { opacity: 0.55 } : undefined}>
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
  buttonRef,
  onClick,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  const intl = useIntl();
  return (
    <Button
      ref={buttonRef}
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
 * page until Done saves it, and none can be made while it does. A tile drags by its handle, by a pointer, by
 * touch after a press and hold, or by the keyboard. After Up or Down focus
 * stays on the moved tile's button, after Hide it goes to the next tile's
 * handle, after Show to the shown tile's, after a drop by the keyboard on
 * its handle, and a screen reader hears each move ("To ship, 2 of 8").
 */
export function CustomiseHome({
  cards,
  arrangement,
  saved,
  onChange,
  onReset,
  onDone,
  saving,
  failure,
  headingRef,
}: {
  cards: readonly KnownCard[];
  arrangement: Arrangement;
  /** Home as it came, which leaving without Done keeps. */
  saved: Arrangement;
  onChange: (next: Arrangement) => void;
  onReset: () => void;
  onDone: () => void;
  saving: boolean;
  failure: unknown;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const intl = useIntl();
  const id = useId();
  const failureWords = useFailureWords(failure);
  const { warning: expiringWithin } = useExpiryDays();
  const [said, setSaid] = useState('');
  // Leaving with changes not saved asks first (Unsaved work).
  const { blocker } = useUnsavedChanges(!sameArrangement(arrangement, saved));
  // Each button by its tile and what it does, for focus after a change.
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
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
    const button = buttons.current.get(key);
    if (!button) return;
    const card = button.closest('li') ?? button;
    // The page follows a moved card, so the button under a finger is still
    // its own: a second tap moves it again, not the tile in its old place.
    if (from !== null) {
      scrollBy(card.getBoundingClientRect().top - from);
    }
    button.focus({ preventScroll: true });
    inView(card, row.current);
  });
  const refFor =
    (kind: HomeKind, action: string) => (element: HTMLButtonElement | null) => {
      buttons.current.set(`${kind}.${action}`, element);
    };
  // The handles' own, one function from draw to draw, so the library keeps
  // its hold of a handle while its tile is dragged.
  const register = useCallback(
    (key: string, element: HTMLButtonElement | null) => {
      buttons.current.set(key, element);
    },
    [],
  );

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
      buttons.current
        .get(focusNext.current)
        ?.closest('li')
        ?.getBoundingClientRect().top ?? null;
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
          ref={headingRef}
          variant="h6"
          component="h2"
          id={`${id}-title`}
          tabIndex={-1}
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          <TuneOutlined aria-hidden fontSize="small" />
          {intl.formatMessage(CUSTOMISE.open)}
        </Typography>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="text"
            color="inherit"
            disabled={saving}
            sx={TONAL}
            onClick={() => {
              onReset();
              setSaid(intl.formatMessage(WORDS.resetNow));
            }}
          >
            {intl.formatMessage(CUSTOMISE.reset)}
          </Button>
          <Button variant="contained" disabled={saving} onClick={onDone}>
            {intl.formatMessage(CUSTOMISE.done)}
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
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage(WORDS.keyboard)}
          </Typography>
        </Box>

        {failureWords && <Alert severity="error">{failureWords}</Alert>}

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
                  register={register}
                  actions={
                    <>
                      <EdgeButton
                        ref={refFor(kind, 'up')}
                        edge={index === 0}
                        icon={<ArrowUpward />}
                        onClick={() => move(kind, -1)}
                      >
                        {intl.formatMessage(WORDS.up)}
                      </EdgeButton>
                      <EdgeButton
                        ref={refFor(kind, 'down')}
                        edge={index === shown.length - 1}
                        icon={<ArrowDownward />}
                        onClick={() => move(kind, 1)}
                      >
                        {intl.formatMessage(WORDS.down)}
                      </EdgeButton>
                      <EdgeButton
                        ref={refFor(kind, 'hide')}
                        icon={<VisibilityOffOutlined />}
                        onClick={() => hideTile(kind)}
                      >
                        {intl.formatMessage(WORDS.hide)}
                      </EdgeButton>
                    </>
                  }
                >
                  <IconBadge
                    size={36}
                    sx={
                      words.late
                        ? {
                            bgcolor: 'tone.critical.bg',
                            color: 'tone.critical.fg',
                          }
                        : { bgcolor: 'surface.chosen', color: 'primary.main' }
                    }
                  >
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
                      {words.quiet
                        ? words.status
                        : words.status
                          ? intl.formatMessage(VALUED.summary, {
                              count: words.count,
                              status: words.status,
                            })
                          : words.count}
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
                    <IconBadge
                      size={36}
                      sx={{
                        bgcolor: 'tone.neutral.bg',
                        color: 'text.secondary',
                      }}
                    >
                      <Icon fontSize="small" />
                    </IconBadge>
                    <Typography id={nameId} sx={{ flex: 1, minWidth: 0 }}>
                      {titleOf(kind)}
                    </Typography>
                    <EdgeButton
                      ref={refFor(kind, 'show')}
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
 * The library's own plugins, its accessibility in the reader's language
 * (ADR-091, amended November 2026): what the handle's description says,
 * and what a screen reader hears as a tile is picked up, moved over a
 * place, dropped or put back, by its name and place as Up and Down say it.
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
  return (defaults) =>
    defaults.map((plugin) =>
      plugin === Accessibility ? accessibility : plugin,
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
  register,
  actions,
  children,
}: {
  kind: HomeKind;
  index: number;
  /** How many tiles are shown, for the place a screen reader hears. */
  total: number;
  name: string;
  nameId: string;
  register: (key: string, element: HTMLButtonElement | null) => void;
  actions: ReactNode;
  children: ReactNode;
}) {
  const intl = useIntl();
  const { ref, handleRef } = useSortable<Spoken>({
    id: kind,
    index,
    data: { name, total },
  });
  const handle = useCallback(
    (element: HTMLButtonElement | null) => {
      handleRef(element);
      register(`${kind}.handle`, element);
    },
    [handleRef, register, kind],
  );
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
          ref={handle}
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
  ref,
  edge = false,
  icon,
  onClick,
  children,
}: {
  ref: (element: HTMLButtonElement | null) => void;
  edge?: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      ref={ref}
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
