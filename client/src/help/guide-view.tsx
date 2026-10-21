import { Box, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

import { GUIDE_TITLE_ID, sectionElementId } from './help-ids';
import type { Block, Inline, ParsedGuide } from './markdown';

/**
 * A guide drawn in the app's own components (ADR-079): its title, then each
 * section with its id, paragraphs, lists, notes and links through the
 * router. Every word is a string React escapes, so nothing in a guide is
 * ever read as markup; what the reader left outside the subset shows as
 * the words it was written with.
 *
 * `onFollow` runs as a link in the guide is followed, so Help can show the
 * page it leads to.
 */
export function GuideView({
  guide,
  onFollow,
}: {
  guide: ParsedGuide;
  onFollow?: () => void;
}) {
  return (
    // Gaps, not margins: a section's heading reaches out with its own.
    <Stack spacing={1.5} useFlexGap>
      <Typography
        variant="h5"
        component="h2"
        id={GUIDE_TITLE_ID}
        tabIndex={-1}
        sx={{ '&:focus': { outline: 'none' } }}
      >
        {guide.title}
      </Typography>
      {guide.blocks.map((block, index) => (
        <BlockView key={index} block={block} onFollow={onFollow} />
      ))}
    </Stack>
  );
}

function BlockView({
  block,
  onFollow,
}: {
  block: Block;
  onFollow?: () => void;
}) {
  switch (block.type) {
    case 'section':
      return (
        <Typography
          variant="h6"
          component="h3"
          id={sectionElementId(block.id)}
          tabIndex={-1}
          sx={{
            pt: 1,
            mx: -1,
            px: 1,
            borderRadius: 1,
            // Marked for a moment when asked for, then fading; at once
            // where less motion is asked for (ADR-075).
            transition: 'background-color 600ms ease-out',
            '&[data-marked]': { bgcolor: 'surface.chosen' },
            '&:focus': { outline: 'none' },
          }}
        >
          {block.text}
        </Typography>
      );
    case 'paragraph':
      return (
        <Typography>
          <Words parts={block.text} onFollow={onFollow} />
        </Typography>
      );
    case 'list':
      return (
        <Box
          component={block.ordered ? 'ol' : 'ul'}
          sx={{ my: 0, pl: 3, '& > li + li': { mt: 0.5 } }}
        >
          {block.items.map((item, index) => (
            <Typography key={index} component="li">
              <Words parts={item} onFollow={onFollow} />
            </Typography>
          ))}
        </Box>
      );
    case 'note':
      return (
        <Typography
          role="note"
          sx={{
            bgcolor: 'background.default',
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            px: 1.5,
            py: 1.25,
          }}
        >
          <Words parts={block.text} onFollow={onFollow} />
        </Typography>
      );
    case 'plain':
      return <Typography>{block.text}</Typography>;
  }
}

function Words({
  parts,
  onFollow,
}: {
  parts: Inline[];
  onFollow?: () => void;
}) {
  return parts.map((part, index) => {
    switch (part.type) {
      case 'text':
        return part.text;
      case 'bold':
        return <strong key={index}>{part.text}</strong>;
      case 'link':
        return (
          <Link
            key={index}
            component={RouterLink}
            to={part.section ? `${part.path}#${part.section}` : part.path}
            // In a sentence, so underlined: colour alone does not tell it
            // from the words around it (WCAG 1.4.1).
            underline="always"
            onClick={onFollow}
          >
            {part.text}
          </Link>
        );
    }
  });
}
