import { defineMessages } from 'react-intl';

/**
 * What src/loading.js shows in the mark's place when the app's own files did
 * not load: one line and a way to try again. No catalogue is loaded by
 * then, so vite.config.ts writes these, in each language, into the script;
 * defined here, they live in the catalogues and their reviews as every
 * other message does. vite.config.ts alone imports it, so it holds nothing
 * of the browser's.
 */
export const LOADING_FAILED = defineMessages({
  line: {
    id: 'loading.failed',
    defaultMessage:
      'The app could not load. Check the connection, then reload.',
  },
  reload: { id: 'loading.reload', defaultMessage: 'Reload' },
});
