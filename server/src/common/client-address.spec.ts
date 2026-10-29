import { clientAddress } from './client-address';

/** ADR-011, amended for #316: the header only when it holds one address. */
describe('clientAddress', () => {
  const SET = { CLIENT_IP_HEADER: 'cf-connecting-ip' };

  function from(value: string) {
    return { ip: '10.0.0.1', headers: { 'cf-connecting-ip': value } };
  }

  it('is req.ip while the setting is unset or empty, whatever the header says', () => {
    expect(clientAddress(from('203.0.113.7'), {})).toBe('10.0.0.1');
    expect(clientAddress(from('203.0.113.7'), { CLIENT_IP_HEADER: '' })).toBe(
      '10.0.0.1',
    );
  });

  it("is the header's IPv4 address, the setting named in any case", () => {
    expect(clientAddress(from('203.0.113.7'), SET)).toBe('203.0.113.7');
    expect(
      clientAddress(from('203.0.113.7'), {
        CLIENT_IP_HEADER: 'CF-Connecting-IP',
      }),
    ).toBe('203.0.113.7');
  });

  it("is the header's IPv6 address, in full", () => {
    expect(clientAddress(from('2001:db8:1:1::7'), SET)).toBe('2001:db8:1:1::7');
  });

  it('is req.ip when the header holds no address, or is missing', () => {
    expect(clientAddress(from('unknown'), SET)).toBe('10.0.0.1');
    expect(clientAddress({ ip: '10.0.0.1', headers: {} }, SET)).toBe(
      '10.0.0.1',
    );
  });

  it('is req.ip when the header holds a list', () => {
    expect(clientAddress(from('203.0.113.7, 10.0.0.2'), SET)).toBe('10.0.0.1');
  });
});
