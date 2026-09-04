import {
  Box,
  Button,
  Collapse,
  IconButton,
  Link,
  Stack,
  Switch,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import { useState } from 'react';

import type { Variant } from './products-page';

/**
 * Millimetres and grams are what is stored, always — a supplier quoting mm and
 * a freight company wanting inches is a formatting problem, not a storage one
 * (ADR-023). This renders the stored value; a unit-system preference and a
 * formatter arrive when someone actually needs inches.
 */
function dimensions(variant: Variant): string | null {
  const { lengthMm, widthMm, heightMm } = variant;
  if (!lengthMm && !widthMm && !heightMm) return null;
  return `${lengthMm ?? '?'} × ${widthMm ?? '?'} × ${heightMm ?? '?'} mm`;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" spacing={1}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}

export function VariantRow({
  variant,
  canEdit,
  saving,
  editing,
  onStartEdit,
  onEditChange,
  onCommitSku,
  onToggleActive,
  onOpenEdit,
}: {
  variant: Variant;
  canEdit: boolean;
  saving: string | null;
  editing: { id: string; sku: string } | null;
  onStartEdit: () => void;
  onEditChange: (sku: string) => void;
  onCommitSku: () => void;
  onToggleActive: () => void;
  onOpenEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const size = dimensions(variant);

  // Only worth expanding when there is something to reveal. A chevron that
  // opens an empty panel reads as broken.
  const hasDetail = size !== null || variant.weightGrams !== null;

  return (
    <>
      <TableRow>
        <TableCell padding="checkbox">
          {hasDetail && (
            <IconButton size="small" onClick={() => setOpen(!open)}>
              {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
            </IconButton>
          )}
        </TableCell>

        <TableCell>
          {editing?.id === variant.id ? (
            <TextField
              size="small"
              value={editing.sku}
              autoFocus
              onChange={(event) => onEditChange(event.target.value)}
              onBlur={onCommitSku}
            />
          ) : (
            // Editable: a typo found after the first receipt should be
            // fixable, and locking it pushes people into creating a duplicate
            // product instead (ADR-023). The rename is audited.
            <Link
              component="button"
              type="button"
              disabled={!canEdit || saving !== null}
              onClick={onStartEdit}
            >
              {variant.sku}
            </Link>
          )}
        </TableCell>

        <TableCell>{variant.name ?? '—'}</TableCell>
        <TableCell>{variant.unitOfMeasure}</TableCell>
        <TableCell align="right">{variant.caseQuantity ?? '—'}</TableCell>

        <TableCell>
          {/* Read-only. Set once at creation, because flipping it on a variant
              with stock leaves every row violating the invariant in one
              direction or the other. */}
          {variant.tracksBatches ? 'Tracked' : '—'}
        </TableCell>

        <TableCell align="center">
          <Switch
            size="small"
            checked={variant.isActive}
            disabled={!canEdit || saving !== null}
            onChange={onToggleActive}
          />
        </TableCell>

        <TableCell align="right">
          {canEdit && (
            <Button variant="text" size="small" onClick={onOpenEdit}>
              Edit
            </Button>
          )}
        </TableCell>
      </TableRow>

      <TableRow>
        {/* Dimensions are entered once and read rarely, so they sit behind a
            chevron rather than adding four columns nobody scans. */}
        <TableCell
          sx={{ py: 0, borderBottom: open ? undefined : 'none' }}
          colSpan={8}
        >
          <Collapse in={open} unmountOnExit>
            <Box sx={{ py: 2, pl: 6 }}>
              <Stack spacing={0.5}>
                {variant.weightGrams !== null && (
                  <Detail label="Weight" value={`${variant.weightGrams} g`} />
                )}
                {size && <Detail label="Dimensions" value={size} />}
              </Stack>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
