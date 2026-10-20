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
  ['AccountController.setPhoto', 'Account events (ADR-022, ADR-063)'],
  [
    'OrganizationDeletionController.requestDeletion',
    'Audited by the service, only when a deletion is scheduled: asking again while one is pending changes nothing (ADR-018, ADR-070)',
  ],
  [
    'OrganizationDeletionController.cancelDeletion',
    'Audited by the service, only when there was a deletion to cancel, from this route or the Account page’s (ADR-018, ADR-070)',
  ],
  ['AccountController.removePhoto', 'Account events (ADR-022, ADR-063)'],
  ['AccountController.requestDeletion', 'Account events (ADR-022, ADR-069)'],
  ['AccountController.cancelDeletion', 'Account events (ADR-022, ADR-069)'],
  [
    'WorkController.updateDetails',
    'Your own details at work, changed by you alone (ADR-063)',
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
    'HomeController.dismissWelcome',
    'Your own welcome, dismissed: it changes only what you see, as a recently opened record does (ADR-079)',
  ],
  ['HomeController.showWelcome', 'Its Undo, as above (ADR-079)'],
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
    'InvitationsController.read',
    'Reads only, spending nothing: a POST so that a mail scanner fetching the link cannot open it (ADR-077)',
  ],
  [
    'OrganizationStartController.start',
    'Account events, as registration: the organization does not exist until it has run (ADR-022, ADR-078)',
  ],
  [
    'InvitationsController.accept',
    'An invitation to join is audited by the service, with the new member as its actor: the route is public, and the actor exists only once it has run (ADR-077). An organization invitation is not: the organization it starts begins with an empty log, as after registration (ADR-078)',
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
