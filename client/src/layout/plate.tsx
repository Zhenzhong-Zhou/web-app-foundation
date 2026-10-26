import { Box } from '@mui/material';
import type { ReactNode } from 'react';

import { initialsLang } from '../lib/person-initials';
import { rem } from '../theme/rem';
import { LIGHT, TYPE } from '../theme/tokens';
import { LOGO_PLATE, SQUARE_LOGO_ON_PLATE } from './logo';
import type { PlateFace } from './use-plate';

/**
 * The white plate a square mark stands on, most logos being made for white
 * (ADR-060, amended; ADR-082). One component wherever it stands, so the
 * rail and Branding's preview cannot draw it differently:
 *
 * - `folded`: the folded rail's plate, 44 px at Standard text and in rem,
 *   so it grows with the text. Its face as usePlate answers: an image at
 *   most 28 px on white, edged in `edge`; the organization's initials on
 *   `accent`; or, while the logo is read, white and empty. `children`
 *   follow the face, the rail's ».
 * - `beside`: a square logo beside the name, at most 32 px, on a padded
 *   white plate: always where `plated` is true, in Dark only where it is
 *   'dark', never where it is false.
 */
export function Plate(
  props:
    | {
        size: 'folded';
        face: PlateFace;
        initials: string;
        accent: string;
        onAccent: string;
        edge: string;
        children?: ReactNode;
      }
    | { size: 'beside'; src: string; alt?: string; plated: boolean | 'dark' },
) {
  if (props.size === 'beside') {
    const { src, alt = '', plated } = props;
    return (
      <Box
        sx={[
          { display: 'flex', flex: 'none' },
          plated === true ? SQUARE_LOGO_ON_PLATE : {},
          plated === 'dark'
            ? (theme) => theme.applyStyles('dark', SQUARE_LOGO_ON_PLATE)
            : {},
        ]}
      >
        <Box
          component="img"
          src={src}
          alt={alt}
          // In rem, so it grows with the name beside it.
          sx={{ display: 'block', maxWidth: rem(32), maxHeight: rem(32) }}
        />
      </Box>
    );
  }

  const { face, initials, accent, onAccent, edge, children } = props;
  const shown = face.kind === 'initials';
  return (
    <Box
      sx={[
        {
          width: rem(44),
          height: rem(44),
          boxSizing: 'border-box',
          flex: 'none',
          borderRadius: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        },
        shown
          ? {
              bgcolor: accent,
              color: onAccent,
              fontWeight: 700,
              fontSize: rem(TYPE.section),
            }
          : {
              // White in both modes, and while the logo is read; » takes
              // Light's text on it.
              bgcolor: LOGO_PLATE,
              color: LIGHT.text,
              border: 1,
              borderColor: edge,
            },
      ]}
    >
      {'src' in face && (
        <Box
          component="img"
          className="face"
          src={face.src}
          alt=""
          // 28 px at Standard text, growing with the plate (ADR-060, amended).
          sx={{ maxWidth: rem(28), maxHeight: rem(28) }}
        />
      )}
      {shown && (
        <span className="face" aria-hidden lang={initialsLang(initials)}>
          {initials}
        </span>
      )}
      {children}
    </Box>
  );
}
