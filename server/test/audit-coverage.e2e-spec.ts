import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { AUDITED } from '../src/core/audit/audited.decorator';

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
    'ShipmentsController.preview',
    'Reads only: computes what a shipment would take. A POST because the question has a body (ADR-041)',
  ],
]);

interface Controller {
  name: string;
  prototype: object;
  instance: Record<string, unknown>;
}

/**
 * DiscoveryService returns InstanceWrapper<any>, so destructuring the instance
 * hands back `any` and every Reflect call on it is unchecked. Narrowed once
 * here rather than cast at each use.
 *
 * `metatype` is typed as `Type<unknown> | Function | null` — `.name` exists on
 * both branches and TypeScript will not narrow to it, hence the cast.
 */
function controllerOf(wrapper: InstanceWrapper): Controller | null {
  const instance = wrapper.instance as Record<string, unknown> | undefined;
  const metatype = wrapper.metatype as { name: string } | undefined;

  if (!instance || !metatype) return null;

  return {
    name: metatype.name,
    prototype: Object.getPrototypeOf(instance) as object,
    instance,
  };
}

/** A method carrying path metadata is a route; anything else is a helper. */
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

describe('audit coverage', () => {
  let app: INestApplication;

  beforeAll(async () => {
    /**
     * Built here rather than through createTestApp, because DiscoveryModule is
     * deliberately not in AppModule — the application has no runtime need to
     * enumerate its own routes, and importing it there would put test
     * scaffolding into production wiring.
     *
     * No configureApp either: this reads route metadata and never sends a
     * request, so versioning and pipes are irrelevant. Shutdown hooks are not
     * — DatabaseModule closes the pg pool in onApplicationShutdown, and
     * without them app.close() leaves the sockets open and Jest never exits.
     */
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

  it('audits every write route, or says why not', () => {
    const discovery = app.get(DiscoveryService);
    const unaudited: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const controller = controllerOf(wrapper);
      if (!controller) continue;

      for (const { key, handler } of routeHandlersOf(controller)) {
        const method = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        ) as RequestMethod;

        if (!WRITE_METHODS.has(method)) continue;
        if (Reflect.getMetadata(AUDITED, handler)) continue;
        if (NOT_AUDITED.has(key)) continue;

        unaudited.push(key);
      }
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
    const discovery = app.get(DiscoveryService);
    const unauditedRoutes = new Set<string>();

    for (const wrapper of discovery.getControllers()) {
      const controller = controllerOf(wrapper);
      if (!controller) continue;

      for (const { key, handler } of routeHandlersOf(controller)) {
        if (Reflect.getMetadata(AUDITED, handler)) continue;
        unauditedRoutes.add(key);
      }
    }

    const stale = [...NOT_AUDITED.keys()].filter(
      (key) => !unauditedRoutes.has(key),
    );

    expect(stale).toEqual([]);
  });
});
