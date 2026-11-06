import Check from '@mui/icons-material/Check';
import { Box } from '@mui/material';

/**
 * A step's mark, Getting started's and the first week's (ADR-079;
 * ADR-091): a tick on green once done, else a ring, the next step's in the
 * accent, holding its number where it has one.
 */
export function StepMark({
  done,
  number,
  next = false,
  size = 32,
}: {
  done: boolean;
  number?: number;
  next?: boolean;
  size?: number;
}) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        typography: 'body2',
        fontWeight: 700,
        ...(done
          ? { bgcolor: 'tone.positive.bg', color: 'tone.positive.fg' }
          : {
              border: 2,
              borderColor: next ? 'primary.main' : 'divider',
              color: 'text.secondary',
            }),
      }}
    >
      {done ? <Check fontSize="small" /> : number}
    </Box>
  );
}
