import type { INestApplication } from '@nestjs/common';

import { IS_PUBLIC } from '../src/core/auth/public.decorator';
import { REQUIRED_PERMISSIONS } from '../src/core/authorization/require-permissions.decorator';
import {
  type Controller,
  createRouteReadingApp,
  routesOf,
} from './utils/routes';

/**
 * Every route either declares the permission it needs, is public, or is on
 * the list below with a reason.
 *
 * The guard only refuses when a route declares something. A route that
 * forgets `@RequirePermissions` is not blocked — it is open to every member
 * of the organization, Viewers included, and nothing looks wrong: the route
 * works, its tests pass, and the hole is one missing line. This is the same
 * shape of invariant as audit coverage, for the same reason.
 */

/**
 * Routes that need a session but no permission, each with its reason.
 *
 * All of them act on the caller's own account, never on somebody else's or
 * on the organization's data: permissions govern acting on *others*, and a
 * self-action is implicit for any signed-in user (permissions.ts, rule 4).
 * Formatted `ControllerName.methodName`.
 */
const SELF_SERVICE = new Map<string, string>([
  ['AuthController.me', 'Who am I — the caller reading their own session'],
  ['AuthController.logout', 'Ending your own session'],
  [
    'AuthController.resendVerification',
    'Your own verification email, before you belong anywhere',
  ],
  ['AccountController.updateProfile', 'Your own name and language'],
  ['AccountController.changePassword', 'Your own password'],
  ['AccountController.listSessions', 'Your own sessions'],
  ['AccountController.revokeSession', 'Ending one of your own sessions'],
  ['AccountController.listEvents', 'Your own account history'],
  ['AccountController.setPhoto', 'Your own photo, set only by you (ADR-063)'],
  ['AccountController.removePhoto', 'As above'],
  ['WorkController.details', 'Your own details at work (ADR-063)'],
  ['WorkController.updateDetails', 'As above'],
  [
    'WorkController.activity',
    'What you did, the person set by the server (ADR-063)',
  ],
  ['WorkController.exportActivity', 'As above'],
  [
    'NotificationsController.unreadCount',
    'Your own notifications, scoped to you by the service (ADR-036)',
  ],
  ['NotificationsController.list', 'As above'],
  ['NotificationsController.markRead', 'As above'],
  ['NotificationsController.markAllRead', 'As above'],
]);

/**
 * Routes open to any member that gate what they return themselves, each
 * part by its own permission, so the route has no single one to declare.
 */
const GATED_INSIDE = new Map<string, string>([
  [
    'LookupController.lookup',
    'Each kind of record by its own view permission, in the service (ADR-056)',
  ],
  [
    'HomeController.get',
    'Each card by its own view permission, in the service (ADR-058)',
  ],
  [
    'RecentController.list',
    'Each kind by its own view permission, in the service (ADR-058)',
  ],
  [
    'RecentController.record',
    'The kind’s own view permission, checked in the handler (ADR-058)',
  ],
  ['RecentController.clear', 'A person’s own history only (ADR-058)'],
  [
    'FilesController.read',
    'The kind’s own view permission, checked in the service once the file is read (ADR-059)',
  ],
]);

const ALLOWED = new Map([...SELF_SERVICE, ...GATED_INSIDE]);

/**
 * The guard reads the handler first and falls back to the class, so a
 * controller marked `@Public()` once covers every route in it. This reads
 * the same way, or a class-level decorator would be reported as missing.
 */
function declared(key: string, handler: object, controller: Controller) {
  return (Reflect.getMetadata(key, handler) ??
    Reflect.getMetadata(key, controller.metatype)) as unknown;
}

function isGuarded(handler: object, controller: Controller): boolean {
  if (declared(IS_PUBLIC, handler, controller) === true) return true;

  const permissions = declared(REQUIRED_PERMISSIONS, handler, controller);

  // An empty list is the same as no list: the guard lets everyone through.
  return Array.isArray(permissions) && permissions.length > 0;
}

describe('permission coverage', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createRouteReadingApp();
  });

  afterAll(async () => {
    await app.close();
  });

  function routes() {
    return routesOf(app).map((route) => ({
      ...route,
      guarded: isGuarded(route.handler, route.controller),
    }));
  }

  it('guards every route, or says why it is self-service', () => {
    const open = routes()
      .filter((route) => !route.guarded && !ALLOWED.has(route.key))
      .map((route) => route.key);

    // Named rather than counted: a failure should say which route to fix.
    expect(open.sort()).toEqual([]);
  });

  /**
   * The list is the other half. An entry left behind after its route gained
   * a permission, or was deleted, becomes an exception nobody is using —
   * and the next route given that name inherits it silently.
   */
  it('has no stale self-service entries', () => {
    const unguarded = new Set(
      routes()
        .filter((route) => !route.guarded)
        .map((route) => route.key),
    );

    const stale = [...ALLOWED.keys()].filter((key) => !unguarded.has(key));

    expect(stale).toEqual([]);
  });
});
