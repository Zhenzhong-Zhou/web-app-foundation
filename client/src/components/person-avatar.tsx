import { Avatar } from '@mui/material';

import { colourOf, initialsLang, initialsOf } from '../lib/person-initials';

/**
 * A person's face (ADR-063): their photo, or their initials on their own
 * colour. The photo's address carries its id, so a new one is a new
 * address; small circles load the 128 px size, large ones the 512.
 * Two Chinese characters are set smaller than two Latin letters, being
 * about twice as wide, and marked Chinese for a screen reader's voice.
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
  const initials = initialsOf(name, email);
  const lang = initialsLang(initials);
  const scale = lang && [...initials].length > 1 ? 0.32 : 0.4;

  return (
    <Avatar
      src={src}
      alt={name ?? email ?? ''}
      slotProps={{ img: { loading: 'lazy' } }}
      sx={{
        width: size,
        height: size,
        fontSize: Math.max(11, Math.round(size * scale)),
        fontWeight: 600,
        bgcolor: colourOf(name, email),
        color: '#FFFFFF',
      }}
    >
      <span lang={lang}>{initials}</span>
    </Avatar>
  );
}
