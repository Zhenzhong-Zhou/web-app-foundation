import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import { Box, type SvgIconProps } from '@mui/material';
import type { ComponentType } from 'react';

/**
 * A product's cover beside its name in a list (ADR-062): the 400 px thumb
 * shown at 40, loaded as it scrolls into view and kept for a year
 * (ADR-059). With no image, a neutral tile, never a stock photo, with
 * the item type's icon where the list knows it (ADR-062, #306's 22).
 */
export function ProductCover({
  fileId,
  name,
  size = 40,
  icon: Icon = Inventory2Outlined,
}: {
  fileId: string | null | undefined;
  name: string;
  size?: number;
  /** The tile's icon with no image: the item's type's, or a box. */
  icon?: ComponentType<SvgIconProps>;
}) {
  const frame = {
    width: size,
    height: size,
    flex: 'none',
    borderRadius: 1,
    border: 1,
    borderColor: 'divider',
    overflow: 'hidden',
  };

  if (!fileId) {
    return (
      <Box
        aria-hidden
        sx={{
          ...frame,
          bgcolor: 'action.hover',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'text.disabled',
        }}
      >
        <Icon fontSize="small" />
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={`/api/v1/files/${fileId}?size=thumb`}
      alt={name}
      loading="lazy"
      sx={{ ...frame, display: 'block', objectFit: 'cover' }}
    />
  );
}
