import ExpandMore from '@mui/icons-material/ExpandMore';
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Collapse,
  FormControlLabel,
  Stack,
  Typography,
} from '@mui/material';
import { useId } from 'react';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';

import {
  type Area,
  AREA_LABELS,
  permissionsIn,
} from '../account/access-phrases';
import type { CataloguePermission, Permission } from '../api/types.gen';
import { useQuoted } from './role-words';

const WORDS = defineMessages({
  tickAll: { id: 'roles.editor.tickAll', defaultMessage: 'Tick all' },
  clear: { id: 'roles.editor.clear', defaultMessage: 'Clear' },
  locked: {
    id: 'roles.editor.locked',
    defaultMessage:
      'Every role sees who works here, the roles and the organization’s settings.',
  },
});

/**
 * What a box says beneath its line that the catalogue does not: prices
 * on orders, what leaving them out does (ADR-080).
 */
const BESIDE: Partial<Record<Permission, MessageDescriptor>> = defineMessages({
  'orders.view_prices': {
    id: 'roles.editor.viewPrices',
    defaultMessage:
      'Without it, orders show no prices and their PDFs can’t be opened. Packing slips never show prices.',
  },
});

/**
 * One of the editor's eight areas (ADR-080), ADR-079's as Your access
 * names them: a heading that opens and folds it, with how many of its
 * boxes are ticked; Tick all and Clear while open; and each permission it
 * offers as a box with its line, what it needs held with it, and who
 * else is told through it. The three every role holds are ticked and
 * locked, with the reason.
 */
export function PermissionArea({
  area,
  catalogue,
  granted,
  open,
  onToggle,
  onChange,
  onTickAll,
  onClear,
}: {
  area: Area;
  catalogue: readonly CataloguePermission[];
  granted: ReadonlySet<Permission>;
  open: boolean;
  onToggle: () => void;
  onChange: (key: Permission, ticked: boolean) => void;
  onTickAll: () => void;
  onClear: () => void;
}) {
  const intl = useIntl();
  const quoted = useQuoted();
  const id = useId();
  const byKey = new Map(catalogue.map((each) => [each.key, each]));
  const boxes = permissionsIn(area)
    .map((key) => byKey.get(key))
    .filter((each): each is CataloguePermission => !!each?.offered);
  if (boxes.length === 0) return null;

  const label = intl.formatMessage(AREA_LABELS[area]);
  const held = boxes.filter((each) => granted.has(each.key)).length;
  const lockedId = `${id}-locked`;
  const anyLocked = boxes.some((each) => each.locked);

  return (
    <Box
      component="section"
      aria-labelledby={`${id}-heading`}
      sx={{ borderTop: 1, borderColor: 'divider' }}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1 }}
      >
        <Typography
          variant="h6"
          component="h3"
          sx={{ flex: '1 1 auto', minWidth: 0 }}
        >
          <ButtonBase
            id={`${id}-heading`}
            aria-expanded={open}
            aria-controls={`${id}-boxes`}
            onClick={onToggle}
            sx={{
              width: '100%',
              minHeight: 44,
              py: 1,
              gap: 1,
              justifyContent: 'flex-start',
              textAlign: 'start',
              font: 'inherit',
            }}
          >
            <ExpandMore
              aria-hidden
              sx={{
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform 150ms',
              }}
            />
            <Box component="span">{label}</Box>
            <Typography
              component="span"
              variant="body2"
              sx={{ color: 'text.secondary' }}
            >
              {intl.formatMessage(
                {
                  id: 'roles.editor.areaCount',
                  defaultMessage: '{held} of {all}',
                },
                {
                  held,
                  all: boxes.length,
                },
              )}
            </Typography>
          </ButtonBase>
        </Typography>
        {open && (
          <Stack direction="row" spacing={0.5}>
            <Button
              variant="text"
              size="small"
              aria-label={intl.formatMessage(
                {
                  id: 'roles.editor.tickAllOf',
                  defaultMessage: 'Tick all: {area}',
                },
                { area: label },
              )}
              onClick={onTickAll}
            >
              {intl.formatMessage(WORDS.tickAll)}
            </Button>
            <Button
              variant="text"
              size="small"
              aria-label={intl.formatMessage(
                { id: 'roles.editor.clearOf', defaultMessage: 'Clear: {area}' },
                { area: label },
              )}
              onClick={onClear}
            >
              {intl.formatMessage(WORDS.clear)}
            </Button>
          </Stack>
        )}
      </Stack>

      <Collapse in={open} id={`${id}-boxes`}>
        <Stack spacing={0.5} sx={{ pb: 1.5, pl: { sm: 4 } }}>
          {anyLocked && (
            <Typography
              id={lockedId}
              variant="body2"
              sx={{ color: 'text.secondary' }}
            >
              {intl.formatMessage(WORDS.locked)}
            </Typography>
          )}
          {boxes.map((box) => {
            const beside = BESIDE[box.key];
            const needs = box.needs.filter((need) => !byKey.get(need)?.locked);
            const lines = [
              needs.length > 0 &&
                intl.formatMessage(
                  {
                    id: 'roles.editor.needs',
                    defaultMessage: 'Needs: {lines}.',
                  },
                  {
                    lines: intl.formatList(
                      needs.map((need) =>
                        quoted(byKey.get(need)?.line ?? need),
                      ),
                    ),
                  },
                ),
              beside && intl.formatMessage(beside),
              box.note,
            ].filter((line): line is string => !!line);
            const lineId = `${id}-${box.key}`;
            return (
              // The line names the box; what it needs and who is told
              // describe it, beneath, outside the label, so its name
              // stays the line alone.
              <Box key={box.key}>
                <FormControlLabel
                  disabled={box.locked}
                  sx={{ alignItems: 'flex-start', m: 0 }}
                  control={
                    <Checkbox
                      checked={granted.has(box.key)}
                      onChange={(event) =>
                        onChange(box.key, event.target.checked)
                      }
                      slotProps={{
                        input: {
                          'aria-describedby': box.locked
                            ? lockedId
                            : lines.length > 0
                              ? lineId
                              : undefined,
                        },
                      }}
                      sx={{ mt: -0.75 }}
                    />
                  }
                  label={box.line}
                />
                {lines.length > 0 && (
                  <Typography
                    id={lineId}
                    variant="body2"
                    // Under the line, past the box.
                    sx={{ color: 'text.secondary', pl: 4.25, mt: -0.5 }}
                  >
                    {/* A line each, so no language's way of joining
                        sentences is assumed. */}
                    {lines.map((line) => (
                      <Box
                        component="span"
                        key={line}
                        sx={{ display: 'block' }}
                      >
                        {line}
                      </Box>
                    ))}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Stack>
      </Collapse>
    </Box>
  );
}
