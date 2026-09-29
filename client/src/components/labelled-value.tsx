import { Stack, Typography } from '@mui/material';

/**
 * A small caption above its value: the summary figures of a cost panel, the
 * facts about a production run.
 *
 * One component rather than a Figure in each cost panel and a Detail on the
 * run page, which were the same markup under two names. The dense variant
 * row keeps its own: label beside value at a fixed width is a different
 * layout for a different job, a spec sheet read down a column.
 */
export function LabelledValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Stack spacing={0.5}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body1">{value}</Typography>
    </Stack>
  );
}
