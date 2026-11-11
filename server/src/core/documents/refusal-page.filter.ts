import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  errorBodyOf,
  type IdentifiedRequest,
  noteFault,
} from '../../common/filters/all-exceptions.filter';
import type { Locale } from '../../common/locales';
import { localeOf, recipientLocale } from '../../i18n/translate';
import { type DocumentPage, refusalPage } from './refusal-page';

/**
 * A page visit, as a browser following Print or Download PDF makes one:
 * `Sec-Fetch-Mode: navigate`, which every current browser sends, or,
 * from one that sends no such header, an Accept that prefers HTML. The
 * app's own requests are neither, and keep the JSON.
 */
function isPageVisit(req: Request): boolean {
  const mode = req.headers['sec-fetch-mode'];
  if (mode !== undefined) return mode === 'navigate';
  // JSON first: a tie, such as */* or no Accept at all, is not a visit.
  return req.accepts(['application/json', 'text/html']) === 'text/html';
}

/**
 * The page's language: the app's, which the link carries as ?locale=
 * since a plain link cannot otherwise say it; else the browser's; else
 * English.
 */
function pageLocale(req: Request): Locale {
  const { locale } = req.query;
  return recipientLocale(
    typeof locale === 'string' ? locale : undefined,
    req.headers['accept-language'],
  );
}

/**
 * A PDF route's refusals (ADR-071, amended for #526), bound by
 * PdfResponse: a page visit gets a page it can read, in the app's
 * language, with the way back to the document's page in the app and the
 * way out where the refusal carries one; any other request gets the JSON
 * exactly as AllExceptionsFilter writes it. Either way the same body, and
 * a fault is logged and reported once, as the global filter does.
 *
 * Its own instance per route, given the document's page, so it cannot use
 * Nest's injection: CLIENT_URL is read from the environment, which the
 * env schema checked at boot, as registrationMode() reads its own.
 */
@Catch()
export class RefusalPageFilter implements ExceptionFilter {
  constructor(private readonly page: DocumentPage) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<IdentifiedRequest>();
    const res = ctx.getResponse<Response>();

    // Once the PDF has started, there is no page to send in its place.
    const visit = !res.headersSent && isPageVisit(req);
    const locale = visit
      ? pageLocale(req)
      : localeOf(req.headers['accept-language']);
    const body = errorBodyOf(exception, req, locale);
    noteFault(exception, req, body);

    if (!visit) {
      // What Express's adapter does with the global filter's body.
      res.status(body.statusCode).json(body);
      return;
    }

    const params = req.params as Record<string, string | undefined>;
    const back = this.page.replace(/:(\w+)/g, (_match, name: string) =>
      encodeURIComponent(params[name] ?? ''),
    );

    res
      .status(body.statusCode)
      .set({
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        // Its own policy, stricter than helmet's: nothing but its inline
        // styles. Without helmet's upgrade-insecure-requests, which WebKit
        // applies to a link to the app at http://localhost and so breaks
        // the way back in development and in the browser tests.
        'Content-Security-Policy':
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      })
      .send(
        refusalPage({
          body,
          locale,
          page: this.page,
          back,
          app: process.env.CLIENT_URL ?? '',
        }),
      );
  }
}
