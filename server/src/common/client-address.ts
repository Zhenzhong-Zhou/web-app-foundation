import { isIP } from 'node:net';

import type { Request } from 'express';

/**
 * The address of the device a request came from (ADR-011, amended for
 * #316): the value of the header CLIENT_IP_HEADER names, when it holds one
 * IP address, else req.ip. On Render req.ip is one of Render's own
 * proxies, and cf-connecting-ip the address that reached Cloudflare, which
 * sets it and replaces any a caller sends. Where nothing in front sets the
 * header, a caller could choose its own address, so the setting stays
 * empty there.
 *
 * Read per request, as registrationMode() reads REGISTRATION, so a spec
 * can change it; the env schema checks the name at boot. A list, or
 * anything else that is not one address, falls back to req.ip rather than
 * trusting a part of it.
 */
export function clientAddress(
  req: Pick<Request, 'ip' | 'headers'>,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const name = env.CLIENT_IP_HEADER?.trim().toLowerCase();
  const value = name ? req.headers[name] : undefined;
  return typeof value === 'string' && isIP(value) !== 0 ? value : req.ip;
}
