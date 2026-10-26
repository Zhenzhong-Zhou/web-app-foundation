import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type ChangeEvent,
  type ReactNode,
  type SubmitEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';

import type { UploadedFileEnvelope } from '../api/types.gen';
import { SettingsSection } from '../components/settings-section';
import {
  LOGO_ON_PLATE,
  LOGO_PLATE,
  logoSrc,
  SQUARE_LOGO_ON_PLATE,
} from '../layout/logo';
import { usePlate } from '../layout/use-plate';
import { api, messageFor } from '../lib/api';
import type { OrganizationLogoKind } from '../lib/api-names';
import { initialsLang, organizationInitialsOf } from '../lib/person-initials';
import { useSubmit } from '../lib/use-submit';
import { nearStatus, normalizeHex, safeAccent } from '../theme/accent';
import { DEFAULT_BRAND } from '../theme/brand-store';
import { rem } from '../theme/rem';
import { RAILS, TYPE } from '../theme/tokens';

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
 * The two logos' rows (ADR-060, amended), each its own route, words and
 * thumbnail, drawn by one component so they cannot drift. A square logo
 * keeps two sizes and its thumbnail asks for the larger; a logo keeps one.
 */
const LOGO_ROWS = {
  logo: {
    route: '/files/logo',
    size: undefined,
    optional: false,
    thumbnail: { height: 56, px: 1.5 },
    words: defineMessages({
      heading: { id: 'settings.branding.logo', defaultMessage: 'Logo' },
      upload: {
        id: 'settings.branding.logo.upload',
        defaultMessage: 'Upload a logo',
      },
      hint: {
        id: 'settings.branding.logo.hint',
        defaultMessage:
          'PNG, JPEG, WebP or SVG, at least 256 pixels wide, up to 2 MB.',
      },
    }),
  },
  square_logo: {
    route: '/files/square-logo',
    size: 'full',
    optional: true,
    thumbnail: { width: 56, height: 56, justifyContent: 'center' },
    words: defineMessages({
      heading: {
        id: 'settings.branding.squareLogo',
        defaultMessage: 'Square logo',
      },
      upload: {
        id: 'settings.branding.squareLogo.upload',
        defaultMessage: 'Upload a square logo',
      },
      hint: {
        id: 'settings.branding.squareLogo.hint',
        defaultMessage:
          'About square, at least 128 pixels on each side. PNG, JPEG, WebP or SVG, up to 2 MB.',
      },
    }),
  },
} as const;

/**
 * One logo's row: its heading, what it is for, the logo itself, Upload or
 * Replace and Remove, and its hint. A file is uploaded at once (ADR-059)
 * and kept only when Save attaches it. While it uploads, the row says so
 * in words, so a screen reader hears it too, and once it is done, how to
 * keep it; a refusal stays in its row.
 * A group named by its heading, so each row's Replace and Remove say
 * which logo they act on.
 */
function LogoRow({
  kind,
  fileId,
  line,
  uploading,
  onUploading,
  onChange,
}: {
  kind: OrganizationLogoKind;
  fileId: string | null;
  line: ReactNode;
  uploading: boolean;
  onUploading: (uploading: boolean) => void;
  onChange: (fileId: string | null) => void;
}) {
  const intl = useIntl();
  const headingId = useId();
  const row = LOGO_ROWS[kind];
  const [error, setError] = useState<string | null>(null);
  // Uploaded and not yet saved: said until the row changes again.
  const [uploaded, setUploaded] = useState(false);
  // Remove takes itself away, so focus goes to the button that stays,
  // Upload, rather than falling to the page.
  const uploadButton = useRef<HTMLLabelElement>(null);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    onUploading(true);
    setError(null);
    setUploaded(false);
    try {
      const { file: stored } = await api<UploadedFileEnvelope>(row.route, {
        method: 'POST',
        body: form,
      });
      onChange(stored.id);
      setUploaded(true);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      onUploading(false);
    }
  }

  return (
    <Stack
      role="group"
      aria-labelledby={headingId}
      spacing={1.5}
      sx={{ minWidth: 0 }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        useFlexGap
        sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}
      >
        <Typography variant="subtitle2" component="h3" id={headingId}>
          {intl.formatMessage(row.words.heading)}
        </Typography>
        {row.optional && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage({
              id: 'settings.branding.squareLogo.optional',
              defaultMessage: 'Optional',
            })}
          </Typography>
        )}
      </Stack>
      <Typography>{line}</Typography>
      {fileId && (
        // On white, as most logos are made for, in either mode.
        <Box
          sx={{
            alignSelf: 'flex-start',
            maxWidth: '100%',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            bgcolor: LOGO_PLATE,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            ...row.thumbnail,
          }}
        >
          <Box
            component="img"
            src={logoSrc(fileId, row.size)}
            alt=""
            sx={{ display: 'block', maxHeight: 40, maxWidth: '100%' }}
          />
        </Box>
      )}
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap' }}
      >
        <Button
          ref={uploadButton}
          component="label"
          variant="outlined"
          disabled={uploading}
        >
          {fileId
            ? intl.formatMessage({
                id: 'settings.branding.logo.replace',
                defaultMessage: 'Replace',
              })
            : intl.formatMessage(row.words.upload)}
          <input
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            disabled={uploading}
            onChange={(event) => void upload(event)}
          />
        </Button>
        {fileId && (
          <Button
            variant="text"
            color="error"
            onClick={() => {
              onChange(null);
              setUploaded(false);
              uploadButton.current?.focus();
            }}
          >
            {intl.formatMessage({
              id: 'settings.branding.logo.remove',
              defaultMessage: 'Remove',
            })}
          </Button>
        )}
        {/* There before it has anything to say, so the words are heard
            when they come. */}
        <Box
          role="status"
          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
        >
          {uploading && (
            <>
              <CircularProgress size={16} aria-hidden />
              {intl.formatMessage({
                id: 'settings.branding.uploading',
                defaultMessage: 'Uploading…',
              })}
            </>
          )}
          {!uploading &&
            uploaded &&
            intl.formatMessage({
              id: 'settings.branding.uploaded',
              defaultMessage: 'Uploaded. Press Save branding to use it.',
            })}
        </Box>
      </Stack>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {intl.formatMessage(row.words.hint)}
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  );
}

/**
 * Branding (ADR-060): the logo, the square logo, the colour and the
 * sidebar's shade, saved together. A custom colour is previewed as the
 * shade that will be saved: the server applies the same check and saves
 * that shade.
 */
export function BrandingForm({
  name,
  logoFileId,
  squareLogoFileId,
  accentColor,
  rail,
  onSaved,
}: {
  name: string;
  logoFileId: string | null;
  squareLogoFileId: string | null;
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
  const [squareLogo, setSquareLogo] = useState(squareLogoFileId);
  const [uploading, setUploading] = useState<
    Record<OrganizationLogoKind, boolean>
  >({ logo: false, square_logo: false });
  // The rail's own rule, on what this form would save.
  const { face, measure } = usePlate(logo, squareLogo);
  const initials = organizationInitialsOf(name);
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

  const uploadingOf = (kind: OrganizationLogoKind) => (on: boolean) =>
    setUploading((current) => ({ ...current, [kind]: on }));

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    void submit(() =>
      api('/organization', {
        method: 'PATCH',
        body: JSON.stringify({
          logoFileId: logo,
          squareLogoFileId: squareLogo,
          // The default is no colour of its own, so a later change of the
          // default reaches it.
          accentColor: choice === 'indigo' ? null : chosen,
          rail: shade,
        }),
      }),
    );
  }

  // What shows on the plate without a square logo, in the plate's own
  // colours, the initials as text so a screen reader reads them; nothing
  // while the logo is read.
  const fallback =
    face.kind === 'initials'
      ? intl.formatMessage(
          {
            id: 'settings.branding.squareLogo.fallbackInitials',
            defaultMessage: 'Without one, the initials {initials} show there.',
          },
          {
            initials: (
              <Box
                key="initials"
                component="span"
                lang={initialsLang(initials)}
                sx={{
                  display: 'inline-block',
                  px: 0.5,
                  borderRadius: 0.5,
                  bgcolor: accent,
                  color: '#FFFFFF',
                  typography: 'caption',
                  fontWeight: 700,
                }}
              >
                {initials}
              </Box>
            ),
          },
        )
      : face.kind === 'logo'
        ? intl.formatMessage({
            id: 'settings.branding.squareLogo.fallbackLogo',
            defaultMessage:
              'Your logo is about square, so it already shows there; upload one only for a different mark.',
          })
        : null;

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
      saveDisabled={
        uploading.logo ||
        uploading.square_logo ||
        (choice === 'custom' && !typed)
      }
      saveLabel={intl.formatMessage({
        id: 'settings.branding.save',
        defaultMessage: 'Save branding',
      })}
    >
      <Typography sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'settings.branding.intro',
          defaultMessage:
            'How the app looks for everyone in this organization: the logo, the colour of buttons and links, and the sidebar.',
        })}
      </Typography>

      {/* Side by side on a computer, one brand in two shapes; on a phone the
          square logo follows the logo, a rule between them either way. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0, 1fr)',
            md: 'minmax(0, 1.3fr) minmax(0, 1fr)',
          },
          gap: { xs: 2.5, md: 4 },
          alignItems: 'start',
          // Only the width changes with the window: a border's shorthand
          // there would take the text's colour.
          '& > :last-child': {
            borderStyle: 'solid',
            borderColor: 'divider',
            borderWidth: { xs: '1px 0 0', md: '0 0 0 1px' },
            pt: { xs: 2.5, md: 0 },
            pl: { xs: 0, md: 4 },
          },
        }}
      >
        <LogoRow
          kind="logo"
          fileId={logo}
          line={intl.formatMessage({
            id: 'settings.branding.logo.line',
            defaultMessage: 'Wide or square, at the top of the sidebar.',
          })}
          uploading={uploading.logo}
          onUploading={uploadingOf('logo')}
          onChange={setLogo}
        />
        <LogoRow
          kind="square_logo"
          fileId={squareLogo}
          line={
            <>
              {intl.formatMessage({
                id: 'settings.branding.squareLogo.line',
                defaultMessage: 'For small spaces, such as the folded sidebar.',
              })}
              {/* On a line of its own, not joined by a space, which some
                  languages do not put between sentences. */}
              {fallback && (
                <Box component="span" sx={{ display: 'block' }}>
                  {fallback}
                </Box>
              )}
            </>
          }
          uploading={uploading.square_logo}
          onUploading={uploadingOf('square_logo')}
          onChange={setSquareLogo}
        />
      </Box>

      {/* A picture for the eye, its heading with it: a screen reader skips
          both, since the square logo's line says in words what the plate
          shows. */}
      <Stack spacing={1} aria-hidden>
        <Typography variant="subtitle2" component="h3">
          {intl.formatMessage({
            id: 'settings.branding.preview',
            defaultMessage: 'How it looks in the sidebar',
          })}
        </Typography>
        {/* Each shade's rail open and folded, as the rail draws them. */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              sm: 'repeat(2, minmax(0, 1fr))',
            },
            gap: 1.5,
            maxWidth: rem(560),
          }}
        >
          {(['dark', 'light'] as const).map((side) => {
            const colours = RAILS[side].light;
            // A logo on the dark rail sits on white, as OrganizationMark
            // draws it.
            const dark = side === 'dark';
            return (
              <Stack
                key={side}
                direction="row"
                spacing={1.5}
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: colours.bg,
                  border: 1,
                  borderColor: colours.divider,
                }}
              >
                <Stack spacing={1} sx={{ flex: '1 1 auto', minWidth: 0 }}>
                  {logo ? (
                    <Box
                      sx={{
                        alignSelf: 'flex-start',
                        maxWidth: '100%',
                        ...(dark ? LOGO_ON_PLATE : {}),
                      }}
                    >
                      <Box
                        component="img"
                        src={logoSrc(logo)}
                        alt=""
                        sx={{
                          display: 'block',
                          maxHeight: 32,
                          maxWidth: '100%',
                        }}
                      />
                    </Box>
                  ) : (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center', minWidth: 0 }}
                    >
                      {squareLogo && (
                        <Box
                          sx={{
                            display: 'flex',
                            flex: 'none',
                            ...(dark ? SQUARE_LOGO_ON_PLATE : {}),
                          }}
                        >
                          <Box
                            component="img"
                            src={logoSrc(squareLogo, 'thumb')}
                            alt=""
                            sx={{
                              display: 'block',
                              maxWidth: rem(32),
                              maxHeight: rem(32),
                            }}
                          />
                        </Box>
                      )}
                      <Typography
                        variant="subtitle1"
                        component="div"
                        noWrap
                        sx={{ color: colours.strong }}
                      >
                        {name}
                      </Typography>
                    </Stack>
                  )}
                  <Box
                    sx={{
                      px: 1,
                      py: 0.5,
                      borderRadius: 1,
                      fontWeight: 600,
                      color: dark ? colours.strong : accent,
                      bgcolor: dark ? colours.active : 'action.hover',
                    }}
                  >
                    {intl.formatMessage({
                      id: 'layout.nav.home',
                      defaultMessage: 'Home',
                    })}
                  </Box>
                </Stack>
                <Box
                  sx={{
                    flex: 'none',
                    borderLeft: 1,
                    borderColor: colours.divider,
                    pl: 1.5,
                  }}
                >
                  <Box
                    sx={[
                      {
                        width: rem(44),
                        height: rem(44),
                        boxSizing: 'border-box',
                        borderRadius: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      face.kind === 'initials'
                        ? {
                            bgcolor: accent,
                            color: '#FFFFFF',
                            fontWeight: 700,
                            fontSize: rem(TYPE.section),
                          }
                        : {
                            bgcolor: LOGO_PLATE,
                            border: 1,
                            borderColor: colours.divider,
                          },
                    ]}
                  >
                    {'src' in face && (
                      <Box
                        component="img"
                        src={face.src}
                        alt=""
                        sx={{ maxWidth: rem(28), maxHeight: rem(28) }}
                      />
                    )}
                    {face.kind === 'initials' && (
                      <span lang={initialsLang(initials)}>{initials}</span>
                    )}
                  </Box>
                </Box>
              </Stack>
            );
          })}
        </Box>
        {measure && <img hidden alt="" {...measure} />}
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
            maxWidth: rem(600),
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
            sx={{ maxWidth: rem(240) }}
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
        {/* A button in the colour that will be saved, for the eye: a
            sample, not a button, under a caption and with a word of its
            own, so nobody takes it for Save. */}
        <Stack spacing={0.75} aria-hidden sx={{ alignItems: 'flex-start' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {intl.formatMessage({
              id: 'settings.branding.sample.caption',
              defaultMessage: 'Buttons will look like this:',
            })}
          </Typography>
          <Box
            sx={{
              px: 2,
              py: 1,
              borderRadius: 1,
              bgcolor: accent,
              color: '#FFFFFF',
              fontWeight: 600,
            }}
          >
            {intl.formatMessage({
              id: 'settings.branding.sample',
              defaultMessage: 'Example',
            })}
          </Box>
        </Stack>
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
