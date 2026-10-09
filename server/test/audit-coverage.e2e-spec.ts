import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';

import { AUDITED } from '../src/core/audit/audited.decorator';
import { createRouteReadingApp, routesOf } from './utils/routes';

/**
 * Every route that changes something is audited.
 *
 * The same class of invariant as the updated_at trigger test: a decorator
 * nothing enforces is one forgotten line away from a silent hole, and the
 * symptom — a change with no entry — looks exactly like a change nobody made.
 *
 * Read routes are deliberately not audited (see Audited's docstring): a
 * dashboard load is twenty GETs and each row costs 24 months of retention.
 * So this checks writes only.
 */
const WRITE_METHODS = new Set([
  RequestMethod.POST,
  RequestMethod.PATCH,
  RequestMethod.PUT,
  RequestMethod.DELETE,
]);

/**
 * Writes that deliberately record nothing, each with its reason.
 *
 * An allow-list rather than a rule, because every one of these is a judgement
 * — and a judgement written down is one somebody can disagree with later.
 * Formatted `ControllerName.methodName`.
 */
const NOT_AUDITED = new Map<string, string>([
  [
    'AuthController.login',
    'Account events, not the org audit log — a user with no organization has no tenant to attribute to (ADR-022)',
  ],
  ['AuthController.logout', 'Account events (ADR-022)'],
  [
    'AuthController.register',
    'Account events, and the organization does not exist yet (ADR-022)',
  ],
  [
    'AuthController.forgotPassword',
    'Account events, and runs signed out (ADR-022)',
  ],
  ['AuthController.resetPassword', 'Account events (ADR-022)'],
  [
    'AuthController.resendVerification',
    'Account events (ADR-022) — @AllowNoOrganization, so there is no tenant to attribute to',
  ],
  ['AuthController.verifyEmail', 'Account events (ADR-022)'],
  [
    'AccountController.updateProfile',
    'Account events: a self-action, not an act on somebody else (ADR-022)',
  ],
  ['AccountController.changePassword', 'Account events (ADR-022)'],
  ['AccountController.revokeSession', 'Account events (ADR-022)'],
  [
    'NotificationsController.markRead',
    'Reading your own notification is not an act on the organization (ADR-036)',
  ],
  ['NotificationsController.markAllRead', 'As above (ADR-036)'],
  [
    'RecentController.record',
    'Opening a record is reading it; the history is the person’s own (ADR-058)',
  ],
  ['RecentController.clear', 'Clearing your own history, as above (ADR-058)'],
  [
    'FilesController.uploadLogo',
    'An upload changes nothing until a record uses it; attaching it is that record’s audited save (ADR-059)',
  ],
  ['FilesController.uploadProductImage', 'As above (ADR-059)'],
  [
    'ShipmentsController.preview',
    'Reads only: computes what a shipment would take. A POST because the question has a body (ADR-041)',
  ],
  [
    'InvoicesController.previewCredit',
    'Computes a credit and stores nothing — a POST only because it carries a body (ADR-047)',
  ],
]);

describe('audit coverage', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createRouteReadingApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('audits every write route, or says why not', () => {
    const unaudited: string[] = [];

    for (const { key, handler } of routesOf(app)) {
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        handler,
      ) as RequestMethod;

      if (!WRITE_METHODS.has(method)) continue;
      if (Reflect.getMetadata(AUDITED, handler)) continue;
      if (NOT_AUDITED.has(key)) continue;

      unaudited.push(key);
    }

    // Named rather than counted: a failure should say which route to fix.
    expect(unaudited.sort()).toEqual([]);
  });

  /**
   * The allow-list is the other half. An entry left behind after its route was
   * audited, or after the route was deleted, turns a deliberate exception into
   * a hole nobody notices.
   */
  it('has no stale exceptions', () => {
    const unauditedRoutes = new Set<string>();

    for (const { key, handler } of routesOf(app)) {
      if (Reflect.getMetadata(AUDITED, handler)) continue;
      unauditedRoutes.add(key);
    }

    const stale = [...NOT_AUDITED.keys()].filter(
      (key) => !unauditedRoutes.has(key),
    );

    expect(stale).toEqual([]);
  });
});
