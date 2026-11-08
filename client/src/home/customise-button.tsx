import TuneOutlined from '@mui/icons-material/TuneOutlined';
import { Button } from '@mui/material';
import type { RefObject } from 'react';
import { defineMessage, useIntl } from 'react-intl';

import { TONAL } from './tonal';

/**
 * Its name, which the panel's heading shares by the same message, so the
 * two cannot drift: one id with two texts fails to extract.
 */
const OPEN = defineMessage({
  id: 'home.customise.open',
  defaultMessage: 'Customise Home',
});

/**
 * The button that opens Customise Home, at the right of "What needs you
 * today", beside the tiles it changes, at every width (ADR-091, amended
 * November 2026). Here, apart from the panel, which loads only once it is
 * pressed.
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
      {intl.formatMessage(OPEN)}
    </Button>
  );
}
