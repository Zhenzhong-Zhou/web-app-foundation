import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { Button } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useIntl } from 'react-intl';

/**
 * The button that opens a row (ADR-093), WAI-ARIA's disclosure: its words
 * say what it opens and how many, "2 places", then a place's "2 lots";
 * the rows it opens are drawn after it, read by `useOpenRows`.
 *
 * Its six states (the design language's Each piece's states): rest,
 * hover, focus and pressed, a plain outlined button's; open, in the
 * accent with the arrow up, `aria-expanded` and its name "Hide …"; busy,
 * "Reading…" once its rows take past 250 ms, still open. It stays the
 * same button throughout, so focus stays on it while the rows below
 * read. 44 px tall on touch, as the theme makes every button (#170).
 */
export function OpeningButton({
  words,
  name,
  open,
  busy,
  controls,
  onClick,
}: {
  /** What it opens and how many: "2 places". */
  words: string;
  /**
   * Its name to a screen reader, closed and open: "Show where Vitamin C
   * 500 mg is", "Hide where Vitamin C 500 mg is".
   */
  name: { show: string; hide: string };
  open: boolean;
  busy: boolean;
  /** The id of what it opens, there while open. */
  controls: string;
  onClick: () => void;
}) {
  const intl = useIntl();

  return (
    <Button
      variant="outlined"
      color={open ? 'primary' : 'inherit'}
      aria-expanded={open}
      aria-controls={open ? controls : undefined}
      aria-busy={busy || undefined}
      aria-label={open ? name.hide : name.show}
      endIcon={busy ? undefined : open ? <ExpandLess /> : <ExpandMore />}
      onClick={onClick}
      sx={{
        whiteSpace: 'nowrap',
        ...(open && {
          bgcolor: (theme) =>
            alpha(
              theme.palette.primary.main,
              theme.palette.action.selectedOpacity,
            ),
        }),
      }}
    >
      {busy
        ? intl.formatMessage({
            id: 'common.reading',
            defaultMessage: 'Reading…',
          })
        : words}
    </Button>
  );
}
