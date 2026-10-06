import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useColorScheme } from '@mui/material/styles';
import { useIntl } from 'react-intl';

/**
 * Three options, not a two-way toggle. "System" is a real preference — it
 * follows the OS as it changes through the day — and a binary switch forces
 * the user to pick a side permanently.
 *
 * MUI persists the choice in localStorage, so it survives a reload.
 */
export function ColorModeSelect() {
  const intl = useIntl();
  const { mode, setMode } = useColorScheme();

  // Undefined until the provider has read the stored preference. Rendering a
  // select with no value would flash the wrong option.
  if (!mode) return null;

  return (
    <Select
      size="small"
      value={mode}
      inputProps={{
        'aria-label': intl.formatMessage({
          id: 'components.colorMode.label',
          defaultMessage: 'Colour mode',
        }),
      }}
      onChange={(event) => setMode(event.target.value as typeof mode)}
    >
      <MenuItem value="system">
        {intl.formatMessage({
          id: 'components.colorMode.system',
          defaultMessage: 'System',
        })}
      </MenuItem>
      <MenuItem value="light">
        {intl.formatMessage({
          id: 'components.colorMode.light',
          defaultMessage: 'Light',
        })}
      </MenuItem>
      <MenuItem value="dark">
        {intl.formatMessage({
          id: 'components.colorMode.dark',
          defaultMessage: 'Dark',
        })}
      </MenuItem>
    </Select>
  );
}
