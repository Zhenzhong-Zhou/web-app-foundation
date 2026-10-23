/**
 * The product's name, the one index.html's title has: VITE_APP_NAME, else
 * its default, compiled in by vite.config.ts's app-name plugin, and by
 * vitest.config.ts for the component tests.
 */
declare const __APP_NAME__: string;

export const APP_NAME: string = __APP_NAME__;
