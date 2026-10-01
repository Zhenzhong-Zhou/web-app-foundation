import {
  Button,
  Chip,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';

import { openDialog } from '../lib/open-dialog';
import type { BomLine } from '../lib/types';

/**
 * A recipe version's components, per batch, with who supplies each. Edit and
 * remove appear only while the version is a draft the person may change;
 * the panel decides that and owns what the buttons do.
 */
export function RecipeLinesTable({
  lines,
  labelFor,
  unitFor,
  editable,
  busy,
  onEdit,
  onRemove,
}: {
  lines: BomLine[];
  labelFor: (componentVariantId: string) => string;
  unitFor: (componentVariantId: string) => string;
  editable: boolean;
  busy: boolean;
  onEdit: (line: BomLine) => void;
  onRemove: (lineId: string) => void;
}) {
  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Component</TableCell>
              <TableCell align="right">Per batch</TableCell>
              <TableCell>Supplied by</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>

          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{labelFor(line.componentVariantId)}</TableCell>
                <TableCell align="right">
                  {line.quantity} {unitFor(line.componentVariantId)}
                </TableCell>
                <TableCell>
                  {line.supplyType === 'external' ? (
                    <Tooltip title="Provided by whoever manufactures — never enters our stock">
                      <Chip label="Manufacturer" size="small" />
                    </Tooltip>
                  ) : (
                    <Chip label="Us" size="small" variant="outlined" />
                  )}
                </TableCell>
                <TableCell align="right">
                  {editable && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      <Button
                        size="small"
                        variant="text"
                        disabled={busy}
                        onClick={openDialog(() => onEdit(line))}
                      >
                        Edit
                      </Button>
                      <IconButton
                        size="small"
                        aria-label={`Remove ${labelFor(line.componentVariantId)}`}
                        disabled={busy}
                        onClick={() => onRemove(line.id)}
                      >
                        ×
                      </IconButton>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
