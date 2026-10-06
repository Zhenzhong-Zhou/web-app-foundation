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
import { useIntl } from 'react-intl';

import { formatQuantity } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { BomLine } from '../lib/types';
import { withUnit } from '../products/units';

/** The remove button's mark: a symbol, the same in every language. */
const CROSS = '×';

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
  const intl = useIntl();

  return (
    <Paper variant="outlined">
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>
                {intl.formatMessage({
                  id: 'production.component',
                  defaultMessage: 'Component',
                })}
              </TableCell>
              <TableCell align="right">
                {intl.formatMessage({
                  id: 'boms.perBatch',
                  defaultMessage: 'Per batch',
                })}
              </TableCell>
              <TableCell>
                {intl.formatMessage({
                  id: 'production.suppliedBy',
                  defaultMessage: 'Supplied by',
                })}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableHead>

          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.id}>
                <TableCell>{labelFor(line.componentVariantId)}</TableCell>
                <TableCell align="right">
                  {unitFor(line.componentVariantId)
                    ? withUnit(
                        line.quantity,
                        unitFor(line.componentVariantId),
                        intl,
                      )
                    : formatQuantity(line.quantity)}
                </TableCell>
                <TableCell>
                  {line.supplyType === 'external' ? (
                    <Tooltip
                      title={intl.formatMessage({
                        id: 'boms.external.tooltip',
                        defaultMessage:
                          'Provided by whoever manufactures — never enters our stock',
                      })}
                    >
                      <Chip
                        label={intl.formatMessage({
                          id: 'production.manufacturer',
                          defaultMessage: 'Manufacturer',
                        })}
                        size="small"
                      />
                    </Tooltip>
                  ) : (
                    <Chip
                      label={intl.formatMessage({
                        id: 'production.us',
                        defaultMessage: 'Us',
                      })}
                      size="small"
                      variant="outlined"
                    />
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
                        {intl.formatMessage({
                          id: 'common.edit',
                          defaultMessage: 'Edit',
                        })}
                      </Button>
                      <IconButton
                        size="small"
                        aria-label={intl.formatMessage(
                          {
                            id: 'orders.lines.remove',
                            defaultMessage: 'Remove {sku}',
                          },
                          { sku: labelFor(line.componentVariantId) },
                        )}
                        disabled={busy}
                        onClick={() => onRemove(line.id)}
                      >
                        {CROSS}
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
