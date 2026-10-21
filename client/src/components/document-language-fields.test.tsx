import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DocumentLanguageFields } from './document-language-fields';

/**
 * A partner's document languages (ADR-054), left to the organization's
 * default: what each select shows before anything is chosen.
 */
describe('DocumentLanguageFields', () => {
  it('shows the default and Nothing else when neither is chosen', () => {
    render(
      <DocumentLanguageFields
        idPrefix="partner-document-language"
        value={{ first: null, second: null }}
        onChange={() => undefined}
        defaultLabel="The organization’s default"
      />,
    );

    expect(
      screen.getByRole('combobox', { name: /^Documents print in/ }),
    ).toHaveTextContent('The organization’s default');
    expect(
      screen.getByRole('combobox', { name: /^Then also in/ }),
    ).toHaveTextContent('Nothing else');
  });
});
