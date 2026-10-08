import { csvField, toCsv } from './csv';

describe('csvField', () => {
  it('writes values as data', () => {
    expect(csvField('Focus 60ct')).toBe('Focus 60ct');
    expect(csvField('1234.5000')).toBe('1234.5000');
    expect(csvField(true)).toBe('true');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes commas, quotes, line breaks and edge spaces (RFC 4180)', () => {
    expect(csvField('Calm, 60ct')).toBe('"Calm, 60ct"');
    expect(csvField('The "best" one')).toBe('"The ""best"" one"');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField(' padded')).toBe('" padded"');
  });

  it('neutralizes a field that would run as a formula', () => {
    expect(csvField('=HYPERLINK("http://x","y")')).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"',
    );
    expect(csvField('+1 555')).toBe("'+1 555");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvField('-cmd')).toBe("'-cmd");
  });

  it('leaves a negative number alone: a credit is not a formula', () => {
    expect(csvField('-12.5000')).toBe('-12.5000');
    expect(csvField('-3')).toBe('-3');
  });

  it('keeps Chinese and French as written', () => {
    expect(csvField('深海鱼油')).toBe('深海鱼油');
    expect(csvField('Éleuthéro')).toBe('Éleuthéro');
  });
});

describe('toCsv', () => {
  it('starts with the byte-order mark and ends rows with CRLF', () => {
    const file = toCsv(['SKU', 'Quantity'], [['FOCUS-60', '12.0000']]);
    expect(file).toBe('\uFEFFSKU,Quantity\r\nFOCUS-60,12.0000\r\n');
  });
});
