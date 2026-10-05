import { useContext } from 'react';

import { LanguageContext, type LanguageState } from './language-context';

export function useLanguage(): LanguageState {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider');
  }
  return context;
}
