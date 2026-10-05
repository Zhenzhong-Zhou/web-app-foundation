import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { useLanguage } from '../i18n/use-language';
import { api } from '../lib/api';
import { isLocale, LANGUAGE_NAMES, SUPPORTED_LOCALES } from '../lib/locales';

/**
 * The language the app speaks to you (ADR-054): in the account menu beside
 * the colour mode, and on the signed-out pages.
 *
 * The screens switch at once and this device remembers the choice. Signed
 * in, it is saved to the account too, so it follows you to another device;
 * if that save fails, this device has still switched, and the next choice
 * saves again — a preference, not a record worth a dialog.
 *
 * Each language is listed in its own name and marked with its own lang, so
 * a screen reader says 简体中文 in Chinese, whatever the screen is in.
 */
export function LanguageSelect() {
  const intl = useIntl();
  const { locale, setLocale } = useLanguage();
  const { session } = useAuth();

  return (
    <Select
      size="small"
      value={locale}
      inputProps={{
        'aria-label': intl.formatMessage({
          id: 'language.label',
          defaultMessage: 'Language',
        }),
      }}
      onChange={(event) => {
        const next = event.target.value;
        if (!isLocale(next) || next === locale) return;

        setLocale(next);

        if (session) {
          void api('/account/profile', {
            method: 'PATCH',
            body: JSON.stringify({ locale: next }),
          }).catch(() => undefined);
        }
      }}
    >
      {SUPPORTED_LOCALES.map((tag) => (
        <MenuItem key={tag} value={tag} lang={tag}>
          {LANGUAGE_NAMES[tag]}
        </MenuItem>
      ))}
    </Select>
  );
}
