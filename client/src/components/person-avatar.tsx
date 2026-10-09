import { Avatar } from '@mui/material';

import { colourOf, initialsOf } from '../lib/person-initials';

/**
 * A person's face (ADR-063): their photo, or their initials on their own
 * colour. The photo's address carries its id, so a new one is a new
 * address; small circles load the 128 px size, large ones the 512.
 */
export function PersonAvatar({
  userId,
  name,
  email,
  photoFileId,
  size = 32,
}: {
  userId: string | null;
  name: string | null;
  email?: string | null;
  photoFileId?: string | null;
  size?: number;
}) {
  const src =
    userId && photoFileId
      ? `/api/v1/people/${userId}/photo?size=${size > 64 ? 'full' : 'thumb'}&v=${photoFileId}`
      : undefined;

  return (
    <Avatar
      src={src}
      alt={name ?? email ?? ''}
      slotProps={{ img: { loading: 'lazy' } }}
      sx={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * 0.4)),
        fontWeight: 600,
        bgcolor: colourOf(name, email),
        color: '#FFFFFF',
      }}
    >
      {initialsOf(name, email)}
    </Avatar>
  );
}
