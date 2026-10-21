import { Button, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode, SubmitEvent } from 'react';
import { useIntl } from 'react-intl';

import type { LearnMoreTarget } from '../help/guides';
import { LearnMore } from '../help/learn-more';
import { FormError } from './form-error';

/**
 * One setting saved on its own: a panel with a heading, the fields, and a
 * Save that says what it saves.
 *
 * Each section is its own form rather than one Save for the page. A base
 * currency and a tax number change for different reasons, and some cannot
 * change once set; saving them together would make one refusal block the
 * other.
 *
 * Save is absent, not disabled, for someone who can only read: a button they
 * can never press is noise. It is disabled while saving and for the
 * section's own reason (`saveDisabled`), usually that nothing has changed.
 *
 * `notice` sits above the error, for what the section needs said before
 * anything else ("Not set yet"), as the sections that have one already did.
 *
 * `learnMore`, for a setting that needs more than its own words, opens Help
 * at its section from the end of the heading (ADR-079).
 */
export function SettingsSection({
  title,
  onSubmit,
  error,
  submitting,
  readOnly,
  saveLabel,
  saveDisabled = false,
  notice,
  learnMore,
  children,
}: {
  title: string;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  error: string | null;
  submitting: boolean;
  readOnly: boolean;
  /** What Save says: "Save address". */
  saveLabel: string;
  saveDisabled?: boolean;
  notice?: ReactNode;
  learnMore?: LearnMoreTarget;
  children: ReactNode;
}) {
  const intl = useIntl();

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <form onSubmit={onSubmit}>
        <Stack spacing={2}>
          <Stack
            direction="row"
            useFlexGap
            sx={{
              justifyContent: 'space-between',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              columnGap: 1.5,
            }}
          >
            <Typography variant="subtitle1" component="h2">
              {title}
            </Typography>
            {learnMore && <LearnMore target={learnMore} variant="beside" />}
          </Stack>

          {notice}

          {error && <FormError message={error} />}

          {children}

          {!readOnly && (
            <Button
              type="submit"
              disabled={submitting || saveDisabled}
              sx={{ alignSelf: 'flex-start' }}
            >
              {submitting
                ? intl.formatMessage({
                    id: 'common.saving',
                    defaultMessage: 'Saving…',
                  })
                : saveLabel}
            </Button>
          )}
        </Stack>
      </form>
    </Paper>
  );
}
