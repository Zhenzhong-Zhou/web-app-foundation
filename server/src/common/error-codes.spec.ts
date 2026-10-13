import { codeOf, ERROR_CODES, withCode } from './error-codes';

/**
 * The filter tells the client a code only when it is one of ours, so a
 * screen never keys on something nobody promised to keep (conventions.md,
 * "Error codes").
 */
describe('codeOf', () => {
  it('reads the code withCode puts beside a message', () => {
    const response = withCode(
      { message: 'Set the address', messageId: 'invoices.x' },
      ERROR_CODES.organizationAddressMissing,
    );

    expect(codeOf(response)).toBe('organization_address_missing');
    // The message is untouched, so the filter still translates it.
    expect(response.messageId).toBe('invoices.x');
  });

  it('ignores a code that is not on the list, and anything not an object', () => {
    expect(codeOf({ message: 'Nope', code: '23505' })).toBeUndefined();
    expect(codeOf({ message: 'Nope', code: 42 })).toBeUndefined();
    expect(codeOf({ message: 'Nope' })).toBeUndefined();
    expect(codeOf('Nope')).toBeUndefined();
    expect(codeOf(null)).toBeUndefined();
  });
});
