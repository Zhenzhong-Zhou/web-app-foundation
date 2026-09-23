import type { INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { IS_PUBLIC } from '../src/core/auth/public.decorator';
import { REQUIRED_PERMISSIONS } from '../src/core/authorization/require-permissions.decorator';

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
  ['AccountController.updateProfile', 'Your own name'],
  ['AccountController.changePassword', 'Your own password'],
  ['AccountController.listSessions', 'Your own sessions'],
  ['AccountController.revokeSession', 'Ending one of your own sessions'],
  ['AccountController.listEvents', 'Your own account history'],
  [
    'NotificationsController.unreadCount',
    'Your own notifications, scoped to you by the service (ADR-036)',
  ],
  ['NotificationsController.list', 'As above'],
  ['NotificationsController.markRead', 'As above'],
  ['NotificationsController.markAllRead', 'As above'],
]);

interface Controller {
  name: string;
  metatype: object;
  prototype: object;
  instance: Record<string, unknown>;
}

function controllerOf(wrapper: InstanceWrapper): Controller | null {
  const instance = wrapper.instance as Record<string, unknown> | undefined;
  const metatype = wrapper.metatype as { name: string } | undefined;

  if (!instance || !metatype) return null;

  return {
    name: metatype.name,
    metatype,
    prototype: Object.getPrototypeOf(instance) as object,
    instance,
  };
}

function routeHandlersOf(controller: Controller) {
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .flatMap((name) => {
      const handler = controller.instance[name];
      if (typeof handler !== 'function') return [];
      if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) return [];

      return [{ key: `${controller.name}.${name}`, handler }];
    });
}

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
    // Built like the audit-coverage test, for the same reasons: it reads
    // route metadata and never sends a request.
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule, AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  function routes() {
    const discovery = app.get(DiscoveryService);

    return discovery.getControllers().flatMap((wrapper) => {
      const controller = controllerOf(wrapper);
      if (!controller) return [];

      return routeHandlersOf(controller).map((route) => ({
        ...route,
        guarded: isGuarded(route.handler, controller),
      }));
    });
  }

  it('guards every route, or says why it is self-service', () => {
    const open = routes()
      .filter((route) => !route.guarded && !SELF_SERVICE.has(route.key))
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

    const stale = [...SELF_SERVICE.keys()].filter((key) => !unguarded.has(key));

    expect(stale).toEqual([]);
  });
});
