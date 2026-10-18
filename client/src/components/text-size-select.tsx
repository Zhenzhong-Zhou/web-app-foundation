import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { defineMessages, useIntl } from 'react-intl';

import {
  isTextSize,
  setTextSize,
  TEXT_SCALE,
  TEXT_SIZES,
  type TextSize,
  useTextSize,
} from '../theme/text-size';

const NAMES = defineMessages<TextSize>({
  standard: {
    id: 'components.textSize.standard',
    defaultMessage: 'Standard text',
  },
  large: { id: 'components.textSize.large', defaultMessage: 'Large text' },
  larger: { id: 'components.textSize.larger', defaultMessage: 'Larger text' },
});

/**
 * The text size (ADR-075): in the account menu beside the colour mode and
 * the language, and on the signed-out pages beside the language, since a
 * person who cannot read the sign-in page needs it before they sign in.
 *
 * The screens change at once and this device remembers the choice. Each
 * option is drawn at the size it would give, in em against the size now,
 * so the choice is seen before it is made.
 */
export function TextSizeSelect() {
  const intl = useIntl();
  const size = useTextSize();

  return (
    <Select
      size="small"
      value={size}
      inputProps={{
        'aria-label': intl.formatMessage({
          id: 'components.textSize.label',
          defaultMessage: 'Text size',
        }),
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (isTextSize(next)) setTextSize(next);
      }}
    >
      {TEXT_SIZES.map((option) => (
        <MenuItem
          key={option}
          value={option}
          sx={{ fontSize: `${TEXT_SCALE[option] / TEXT_SCALE[size]}em` }}
        >
          {intl.formatMessage(NAMES[option])}
        </MenuItem>
      ))}
    </Select>
  );
}
