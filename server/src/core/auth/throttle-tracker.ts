import {
  normalizeIp,
  type ThrottlerGetTrackerFunction,
} from '@nestjs/throttler';
import type { Request } from 'express';

import { clientAddress } from '../../common/client-address';
import { getRequestContext } from './request-context';

/**
 * Whose count a request adds to (ADR-011, amended for #316): the signed-in
 * person, whose tabs and devices share one allowance; signed out, the
 * client's own address. Every route's limit takes it, but sign-in's and
 * the forgotten password's, which key on the email and the address
 * (loginTracker).
 *
 * The session middleware has resolved the cookie before any guard runs,
 * so the person is known here. Never the cookie itself, which a flood
 * could vary to get a fresh allowance each time.
 */
export const throttleTracker: ThrottlerGetTrackerFunction = (req) => {
  const request = req as Request;
  const context = getRequestContext(request);
  if (context) return `user:${context.userId}`;
  return `address:${trackedAddress(request)}`;
};

/**
 * The client's address as a counter keys it: IPv6 by its /64, as the
 * library's own tracker does, since one device may hold a whole /64 and
 * would otherwise take an allowance for each address in it.
 */
export function trackedAddress(req: Request): string {
  return normalizeIp(clientAddress(req) ?? 'unknown', 64);
}
