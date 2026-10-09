import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type ChangeEvent, type SubmitEvent, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { SettingsSection } from '../components/settings-section';
import { api, messageFor } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import { nearStatus, normalizeHex, safeAccent } from '../theme/accent';
import { DEFAULT_BRAND } from '../theme/brand-store';
import { RAILS } from '../theme/tokens';

/** ADR-060's six, each tested in both modes: none needs adjusting. */
const PRESETS = [
  ['indigo', DEFAULT_BRAND.accent],
  ['blue', '#1F5FBF'],
  ['teal', '#0F6E6E'],
  ['greenSlate', '#2F5D50'],
  ['plum', '#7A3B69'],
  ['charcoal', '#3A4150'],
] as const;
type PresetName = (typeof PRESETS)[number][0];

const PRESET_LABEL = defineMessages<PresetName>({
  indigo: { id: 'settings.branding.preset.indigo', defaultMessage: 'Indigo' },
  blue: { id: 'settings.branding.preset.blue', defaultMessage: 'Blue' },
  teal: { id: 'settings.branding.preset.teal', defaultMessage: 'Teal' },
  greenSlate: {
    id: 'settings.branding.preset.greenSlate',
    defaultMessage: 'Green slate',
  },
  plum: { id: 'settings.branding.preset.plum', defaultMessage: 'Plum' },
  charcoal: {
    id: 'settings.branding.preset.charcoal',
    defaultMessage: 'Charcoal',
  },
});

const NEAR = defineMessages({
  error: {
    id: 'settings.branding.near.error',
    defaultMessage:
      'This colour is close to the red used for errors and late orders. Buttons may look like warnings.',
  },
  warning: {
    id: 'settings.branding.near.warning',
    defaultMessage:
      'This colour is close to the amber used for warnings. Buttons may look like warnings.',
  },
  success: {
    id: 'settings.branding.near.success',
    defaultMessage:
      'This colour is close to the green used for things done. Buttons may look like confirmations.',
  },
});

/**
 * Branding (ADR-060): the logo, the colour and the sidebar's shade, saved
 * together. A logo is uploaded at once (ADR-059) and kept only when Save
 * attaches it. A custom colour is previewed as the shade that will be
 * saved: the server applies the same check and saves that shade.
 */
export function BrandingForm({
  logoFileId,
  accentColor,
  rail,
  onSaved,
}: {
  logoFileId: string | null;
  accentColor: string | null;
  rail: 'dark' | 'light';
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const preset = PRESETS.find(([, hex]) => hex === (accentColor ?? ''));
  const [choice, setChoice] = useState<PresetName | 'custom'>(
    accentColor === null ? 'indigo' : (preset?.[0] ?? 'custom'),
  );
  const [custom, setCustom] = useState(preset ? '' : (accentColor ?? ''));
  const [shade, setShade] = useState(rail);
  const [logo, setLogo] = useState(logoFileId);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { submitting, error, submit } = useSubmit(onSaved, {
    success: intl.formatMessage({
      id: 'settings.branding.saved',
      defaultMessage: 'Branding saved',
    }),
  });

  const typed = normalizeHex(custom);
  const chosen =
    choice === 'custom'
      ? typed
      : (PRESETS.find(([name]) => name === choice)?.[1] ?? null);
  const safe = chosen ? safeAccent(chosen) : null;
  const near = chosen ? nearStatus(chosen) : null;
  const accent = safe?.accent ?? DEFAULT_BRAND.accent;

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    setUploadError(null);
    try {
      const { file: stored } = await api<{ file: { id: string } }>(
        '/files/logo',
        { method: 'POST', body: form },
      );
      setLogo(stored.id);
    } catch (caught) {
      setUploadError(messageFor(caught));
    } finally {
      setUploading(false);
    }
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          logoFileId: logo,
          // The default is no colour of its own, so a later change of the
          // default reaches it.
          accentColor: choice === 'indigo' ? null : chosen,
          rail: shade,
        }),
      }),
    );
  }

  const logoImage = logo ? (
    <Box
      component="img"
      src={`/api/v1/files/${logo}`}
      alt=""
      sx={{ display: 'block', maxHeight: 32, maxWidth: '100%' }}
    />
  ) : null;

  return (
    <SettingsSection
      title={intl.formatMessage({
        id: 'settings.branding.title',
        defaultMessage: 'Branding',
      })}
      onSubmit={handleSubmit}
      error={error}
      submitting={submitting}
      readOnly={false}
      saveDisabled={uploading || (choice === 'custom' && !typed)}
      saveLabel={intl.formatMessage({
        id: 'settings.branding.save',
        defaultMessage: 'Save branding',
      })}
    >
      <Typography color="text.secondary">
        {intl.formatMessage({
          id: 'settings.branding.intro',
          defaultMessage:
            'How the app looks for everyone in this organization: the logo, the colour of buttons and links, and the sidebar.',
        })}
      </Typography>

      <Stack spacing={1.5}>
        <Typography variant="subtitle2" component="h3">
          {intl.formatMessage({
            id: 'settings.branding.logo',
            defaultMessage: 'Logo',
          })}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button component="label" variant="outlined" disabled={uploading}>
            {logo
              ? intl.formatMessage({
                  id: 'settings.branding.logo.replace',
                  defaultMessage: 'Replace',
                })
              : intl.formatMessage({
                  id: 'settings.branding.logo.upload',
                  defaultMessage: 'Upload a logo',
                })}
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => void upload(event)}
            />
          </Button>
          {logo && (
            <Button color="error" onClick={() => setLogo(null)}>
              {intl.formatMessage({
                id: 'settings.branding.logo.remove',
                defaultMessage: 'Remove',
              })}
            </Button>
          )}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          {intl.formatMessage({
            id: 'settings.branding.logo.hint',
            defaultMessage:
              'PNG, JPEG, WebP or SVG, at least 256 pixels wide, up to 2 MB.',
          })}
        </Typography>
        {uploadError && <Alert severity="error">{uploadError}</Alert>}
      </Stack>

      <Stack spacing={1}>
        <Typography variant="subtitle2" component="h3">
          {intl.formatMessage({
            id: 'settings.branding.preview',
            defaultMessage: 'How it looks in the sidebar',
          })}
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 1.5,
            maxWidth: 520,
          }}
        >
          {(['dark', 'light'] as const).map((side) => (
            <Stack
              key={side}
              spacing={1}
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: RAILS[side].light.bg,
                border: 1,
                borderColor: RAILS[side].light.divider,
              }}
            >
              <Box
                sx={{
                  alignSelf: 'flex-start',
                  minHeight: 32,
                  ...(side === 'dark'
                    ? { bgcolor: '#FFFFFF', borderRadius: 1, px: 1, py: 0.5 }
                    : {}),
                }}
              >
                {logoImage}
              </Box>
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  borderRadius: 1,
                  fontWeight: 600,
                  color: side === 'dark' ? RAILS.dark.light.strong : accent,
                  bgcolor:
                    side === 'dark' ? RAILS.dark.light.active : 'action.hover',
                }}
              >
                {intl.formatMessage({
                  id: 'layout.nav.home',
                  defaultMessage: 'Home',
                })}
              </Box>
            </Stack>
          ))}
        </Box>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="subtitle2" component="h3" id="branding-colour">
          {intl.formatMessage({
            id: 'settings.branding.colour',
            defaultMessage: 'Colour',
          })}
        </Typography>
        <RadioGroup
          aria-labelledby="branding-colour"
          value={choice}
          onChange={(event) =>
            setChoice(event.target.value as PresetName | 'custom')
          }
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(3, minmax(0, 1fr))',
            },
            gap: 1,
            maxWidth: 600,
          }}
        >
          {PRESETS.map(([name, hex]) => (
            <FormControlLabel
              key={name}
              value={name}
              control={<Radio />}
              label={
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <Box
                    sx={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      bgcolor: hex,
                    }}
                  />
                  <span>{intl.formatMessage(PRESET_LABEL[name])}</span>
                </Stack>
              }
            />
          ))}
          <FormControlLabel
            value="custom"
            control={<Radio />}
            label={intl.formatMessage({
              id: 'settings.branding.custom',
              defaultMessage: 'Your own colour',
            })}
          />
        </RadioGroup>
        {choice === 'custom' && (
          <TextField
            id="branding-custom-colour"
            label={intl.formatMessage({
              id: 'settings.branding.custom.label',
              defaultMessage: 'Your own colour, as #RRGGBB',
            })}
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            sx={{ maxWidth: 240 }}
          />
        )}
        {safe?.adjusted && chosen && (
          <Alert severity="info">
            {intl.formatMessage(
              {
                id: 'settings.branding.adjusted',
                defaultMessage:
                  'White text on {chosen} is too faint to read easily. {used}, the same colour made readable, will be saved.',
              },
              { chosen, used: safe.accent },
            )}
          </Alert>
        )}
        {near && (
          <Alert severity="warning">{intl.formatMessage(NEAR[near])}</Alert>
        )}
        <Box
          aria-hidden
          sx={{
            alignSelf: 'flex-start',
            px: 2,
            py: 1,
            borderRadius: 1,
            bgcolor: accent,
            color: '#FFFFFF',
            fontWeight: 600,
          }}
        >
          {intl.formatMessage({
            id: 'settings.branding.save',
            defaultMessage: 'Save branding',
          })}
        </Box>
      </Stack>

      <Stack spacing={1}>
        <Typography variant="subtitle2" component="h3" id="branding-rail">
          {intl.formatMessage({
            id: 'settings.branding.sidebar',
            defaultMessage: 'Sidebar',
          })}
        </Typography>
        <RadioGroup
          row
          aria-labelledby="branding-rail"
          value={shade}
          onChange={(event) => setShade(event.target.value as 'dark' | 'light')}
        >
          <FormControlLabel
            value="dark"
            control={<Radio />}
            label={intl.formatMessage({
              id: 'settings.branding.sidebar.dark',
              defaultMessage: 'Dark',
            })}
          />
          <FormControlLabel
            value="light"
            control={<Radio />}
            label={intl.formatMessage({
              id: 'settings.branding.sidebar.light',
              defaultMessage: 'Light',
            })}
          />
        </RadioGroup>
      </Stack>
    </SettingsSection>
  );
}
