import {
  contractFor,
  described,
  type Document,
  documentPath,
} from './utils/response-contract';

/**
 * The check every e2e response passes through (ADR-068): what it lets by
 * and what it stops, on a document small enough to read. The suite's
 * other tests run it against the real one.
 */
const document: Document = {
  paths: {
    '/v1/codes/{id}': {
      get: {
        responses: {
          200: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CodeEnvelope' },
              },
            },
          },
        },
      },
    },
    '/v1/codes': {
      get: { responses: { 200: {} } },
    },
  },
  components: {
    schemas: {
      Code: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          parent: {
            anyOf: [{ $ref: '#/components/schemas/Code' }, { type: 'null' }],
          },
          labels: { type: 'object' },
        },
        required: ['id', 'name', 'parent'],
      },
      CodeEnvelope: {
        type: 'object',
        properties: { code: { $ref: '#/components/schemas/Code' } },
        required: ['code'],
      },
    },
  },
};

describe('the response contract check (ADR-068)', () => {
  const validatorFor = contractFor(document);

  it('names routes as the document does', () => {
    const route = '/v1/invoices/:id/lines/:lineId';

    expect(documentPath(route)).toBe('/v1/invoices/{id}/lines/{lineId}');
  });

  it('passes a response that is exactly what the contract declares', () => {
    const validate = validatorFor('get', '/v1/codes/{id}', 200)!;

    const exact = { code: { id: 'a', name: 'GST', parent: null } };

    expect(validate(exact)).toBe(true);
  });

  /**
   * The case the check exists for: a spread table row sends a column the
   * contract never declared, at any depth, and the compiler cannot see it.
   */
  it('fails a field the contract does not declare, and names it', () => {
    const validate = validatorFor('get', '/v1/codes/{id}', 200)!;
    const parent = { id: 'p', name: 'Tax', parent: null, organizationId: 'o' };

    expect(validate({ code: { id: 'a', name: 'GST', parent } })).toBe(false);
    expect(described(validate)).toContain(
      '/code/parent must NOT have additional properties (organizationId)',
    );
  });

  it('fails a declared field that is missing or of the wrong type', () => {
    const validate = validatorFor('get', '/v1/codes/{id}', 200)!;

    const missing = { code: { id: 'a', parent: null } };
    const wrongType = { code: { id: 1, name: 'GST', parent: null } };

    expect(validate(missing)).toBe(false);
    expect(validate(wrongType)).toBe(false);
  });

  /** A map has no property list to hold it to, so it stays open. */
  it('leaves an object without a property list open', () => {
    const validate = validatorFor('get', '/v1/codes/{id}', 200)!;
    const labels = { en: 'GST', 'fr-CA': 'TPS' };
    const labelled = { code: { id: 'a', name: 'GST', parent: null, labels } };

    expect(validate(labelled)).toBe(true);
  });

  /** Not converted yet: no declared response, so nothing to check. */
  it('skips a response the document does not describe', () => {
    expect(validatorFor('get', '/v1/codes', 200)).toBeNull();
    expect(validatorFor('get', '/v1/unknown', 200)).toBeNull();
  });
});
