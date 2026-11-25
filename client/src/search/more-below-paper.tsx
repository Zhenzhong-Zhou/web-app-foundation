import { Paper, type PaperProps, Typography } from '@mui/material';
import { useForkRef } from '@mui/material/utils';
import {
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';

/**
 * The lookup's paper (#618; ADR-056, amended for ADR-094's amendment): its
 * list, and under it, while the list is cut at its edge, a line saying how
 * many rows are below, "6 more below · scroll, or keep typing to narrow".
 * Counted again after every answer, as the list scrolls, the arrow keys
 * scrolling it too, and as the window changes; gone once the last row is in
 * view.
 *
 * The paper is a column held to the list's height (`sx` from the box), so
 * the line takes its room from the list rather than running past the
 * screen's foot. Whether the list is cut is asked as if the line were not
 * there, so a list that fits without it never keeps it.
 */
export function MoreBelowPaper({
  children,
  ref,
  ...props
}: PaperProps & { ref?: Ref<HTMLDivElement> }) {
  const intl = useIntl();
  const paper = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLDivElement>(null);
  const both = useForkRef(paper, ref);
  const [below, setBelow] = useState(0);

  const count = useCallback(() => {
    const listbox =
      paper.current?.querySelector<HTMLElement>('[role="listbox"]');
    if (!listbox) {
      setBelow(0);
      return;
    }
    const rows = [
      ...listbox.querySelectorAll<HTMLElement>('[role="option"]'),
    ].map((row) => row.getBoundingClientRect().bottom);
    const edge = listbox.getBoundingClientRect().bottom;
    const past = (bottom: number) =>
      rows.filter((row) => row > bottom + 1).length;
    setBelow(
      past(edge + (line.current?.offsetHeight ?? 0)) > 0 ? past(edge) : 0,
    );
  }, []);

  // After every render: a new answer is a new list.
  useLayoutEffect(() => count());

  useEffect(() => {
    const node = paper.current;
    // A scroll does not bubble; the list's reaches its paper on the way down.
    node?.addEventListener('scroll', count, true);
    window.addEventListener('resize', count);
    return () => {
      node?.removeEventListener('scroll', count, true);
      window.removeEventListener('resize', count);
    };
  }, [count]);

  return (
    <Paper ref={both} {...props}>
      {children}
      {below > 0 && (
        <Typography
          ref={line}
          component="div"
          variant="body2"
          // As the list's own rows do: a press here keeps the field focused,
          // so the list stays open.
          onMouseDown={(event) => event.preventDefault()}
          sx={{
            flexShrink: 0,
            px: 2,
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            color: 'text.secondary',
            textAlign: 'center',
          }}
        >
          {intl.formatMessage(
            {
              id: 'search.moreBelow',
              defaultMessage:
                '{count, plural, one {# more below} other {# more below}} · scroll, or keep typing to narrow',
            },
            { count: below },
          )}
        </Typography>
      )}
    </Paper>
  );
}
