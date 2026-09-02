import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useColorScheme } from '@mui/material/styles';

/**
 * Three options, not a two-way toggle. "System" is a real preference — it
 * follows the OS as it changes through the day — and a binary switch forces
 * the user to pick a side permanently.
 *
 * MUI persists the choice in localStorage, so it survives a reload.
 */
export function ColorModeSelect() {
  const { mode, setMode } = useColorScheme();

  // Undefined until the provider has read the stored preference. Rendering a
  // select with no value would flash the wrong option.
  if (!mode) return null;

  return (
    <Select
      size="small"
      value={mode}
      onChange={(event) => setMode(event.target.value as typeof mode)}
    >
      <MenuItem value="system">System</MenuItem>
      <MenuItem value="light">Light</MenuItem>
      <MenuItem value="dark">Dark</MenuItem>
    </Select>
  );
}
