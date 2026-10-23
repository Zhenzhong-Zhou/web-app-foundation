import { randomUUID } from 'node:crypto';

import type { Options } from 'pino-http';

import type { Env } from '../config/env';
import { requestLogLevel } from './request-log-level';

/** The request log's options (AppModule's pinoHttp), by environment. */
export function requestLogOptions(nodeEnv: Env['NODE_ENV']): Options {
  const isProd = nodeEnv === 'production';

  return {
    level: nodeEnv === 'test' ? 'silent' : isProd ? 'info' : 'debug',
    // Structured JSON in production so log aggregators can parse it;
    // human-readable locally.
    transport: isProd
      ? undefined
      : { target: 'pino-pretty', options: { singleLine: true } },

    // ADR-011: session tokens live in cookies. Logging them would
    // undo the reason we only store their hash.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
      ],
      remove: true,
    },

    // Correlates every log line for one request, and hands the client
    // an id to quote in a bug report.
    genReqId: (req, res) => {
      const id = (req.headers['x-request-id'] as string) ?? randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },

    // The request in full on its own line only, the one written when it
    // ends; every other line written during it carries `reqId` alone, so a
    // search term in the query or a header lands in one line rather than
    // in each (#193). That id is on every line, the request's own
    // included, and is what support searches by.
    quietReqLogger: true,

    // Liveness probes fire every few seconds; logging them buries
    // everything else.
    autoLogging: {
      ignore: (req) => req.url?.startsWith('/health') ?? false,
    },

    customLogLevel: requestLogLevel,
  };
}
