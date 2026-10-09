import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import { Box } from '@mui/material';

/**
 * A product's cover beside its name in a list (ADR-062): the 400 px thumb
 * shown at 40, loaded as it scrolls into view and kept for a year
 * (ADR-059). With no image, a neutral tile, never a stock photo.
 */
export function ProductCover({
  fileId,
  name,
}: {
  fileId: string | null | undefined;
  name: string;
}) {
  const frame = {
    width: 40,
    height: 40,
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
        <Inventory2Outlined fontSize="small" />
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
