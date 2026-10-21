import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import { Button, Link } from '@mui/material';
import { useIntl } from 'react-intl';

import type { LearnMoreTarget } from './guides';
import { useHelp } from './use-help';

/**
 * Opens Help at a guide's section (ADR-079), from where a page needs more
 * than its own words: an empty list, a Getting started step, a hard
 * setting. The target is typed by the guide map, so one that names a
 * section not listed there does not compile, and the check proves each
 * listed section exists in every language.
 *
 * - `button`: beside an empty list's action.
 * - `inline`: after a sentence, a link among its words.
 * - `beside`: at the end of a section's heading or a field's help text,
 *   with Help's icon.
 *
 * `after` is the words it follows, joined as each language joins them: a
 * space in English and French, none in Chinese.
 *
 * Draws nothing outside the signed-in frame, which alone has Help; `after`
 * is then the words alone.
 */
export function LearnMore({
  target,
  variant,
  after,
}: {
  target: LearnMoreTarget;
  variant: 'button' | 'inline' | 'beside';
  after?: string;
}) {
  const intl = useIntl();
  const help = useHelp();
  if (!help) return after ?? null;

  if (after !== undefined) {
    return intl.formatMessage(
      { id: 'help.learnMoreAfter', defaultMessage: '{text} {learnMore}' },
      {
        text: after,
        learnMore: <LearnMore target={target} variant={variant} />,
      },
    );
  }

  const label = intl.formatMessage({
    id: 'help.learnMore',
    defaultMessage: 'Learn more',
  });
  const open = () => help.learnMore(target);

  if (variant === 'button') {
    return (
      <Button variant="outlined" onClick={open}>
        {label}
      </Button>
    );
  }

  return (
    <Link
      component="button"
      type="button"
      onClick={open}
      underline={variant === 'inline' ? 'always' : 'hover'}
      sx={{
        font: 'inherit',
        verticalAlign: 'baseline',
        whiteSpace: 'nowrap',
        ...(variant === 'beside' && {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.5,
          fontWeight: 600,
        }),
      }}
    >
      {variant === 'beside' && (
        <HelpOutlineOutlined aria-hidden sx={{ fontSize: '1.15em' }} />
      )}
      {label}
    </Link>
  );
}
