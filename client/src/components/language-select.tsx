import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { useLanguage } from '../i18n/use-language';
import { api } from '../lib/api';
import { isLocale, pickerName, SUPPORTED_LOCALES } from '../lib/locales';
import type { PreferenceControl } from './preference-control';

/**
 * The language the app speaks to you (ADR-054): in the account menu beside
 * the colour mode, on the signed-out pages, and on the Account page.
 *
 * The screens switch as soon as the language has loaded, and this device
 * remembers the choice. Signed in, it is saved to the account too, so it
 * follows you to another device, and the session is read again, so every
 * picker shows what the account now holds. If that save fails, this device
 * has still switched, and the next choice saves again — a preference, not
 * a record worth a dialog. A language that will not load saves nothing
 * anywhere until it does, after Try again in the toast that says so
 * (ADR-081).
 *
 * `account` shows the account's own choice instead of this device's (#119).
 * An account with none chosen gets its emails in English when a colleague's
 * action sends them, while its screens follow the device; showing the
 * device's language there read as chosen, and picking it changed nothing,
 * so it could never be saved. There, none reads Not chosen, and any choice,
 * the one already on screen included, saves.
 *
 * Each language is listed in its own name and marked with its own lang, so
 * a screen reader says 简体中文 in Chinese, whatever the screen is in.
 */
export function LanguageSelect({
  account = false,
  describedBy,
  control,
}: {
  account?: boolean;
  /** The id of a line that says more about the choice. */
  describedBy?: string;
  /** Opened by its row, in the account menu (#151). */
  control?: PreferenceControl;
}) {
  const intl = useIntl();
  const { locale, setLocale } = useLanguage();
  const { session, refresh } = useAuth();
  // '' is none chosen, which only the account can be.
  const chosen = account ? (session?.user.locale ?? '') : locale;
  const notChosen = intl.formatMessage({
    id: 'language.notChosen',
    defaultMessage: 'Not chosen',
  });

  return (
    <Select
      {...control}
      size="small"
      value={chosen}
      displayEmpty
      renderValue={(value) => (isLocale(value) ? pickerName(value) : notChosen)}
      inputProps={{
        'aria-label': intl.formatMessage({
          id: 'language.label',
          defaultMessage: 'Language',
        }),
        'aria-describedby': describedBy,
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!isLocale(next) || next === chosen) return;

        void setLocale(next).then((switched) => {
          if (!switched || !session) return;
          void api('/account/profile', {
            method: 'PATCH',
            body: JSON.stringify({ locale: next }),
          })
            .then(refresh)
            .catch(() => undefined);
        });
      }}
    >
      {SUPPORTED_LOCALES.map((tag) => (
        <MenuItem key={tag} value={tag} lang={tag}>
          {pickerName(tag)}
        </MenuItem>
      ))}
    </Select>
  );
}
