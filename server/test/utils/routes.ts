import type { INestApplication } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryModule, DiscoveryService } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';

/**
 * For the coverage specs, which check a rule against every route rather than
 * by calling any: every write is audited, every route is guarded. Both walk
 * the same controllers the same way; the walk lives here and each spec keeps
 * its rule and its list of deliberate exceptions.
 */

export interface Controller {
  name: string;
  /** The class, for decorators applied to the whole controller. */
  metatype: object;
  prototype: object;
  instance: Record<string, unknown>;
}

export interface Route {
  /** `ControllerName.methodName`, the form the exception lists use. */
  key: string;
  handler: object;
  controller: Controller;
}

/**
 * The app built only to read route metadata, never to serve a request.
 *
 * Not through createTestApp, because DiscoveryModule is deliberately not in
 * AppModule — the application has no runtime need to enumerate its own
 * routes, and importing it there would put test scaffolding into production
 * wiring. No configureApp either: versioning and pipes do not matter to
 * metadata. Shutdown hooks do — DatabaseModule closes the pg pool in
 * onApplicationShutdown, and without them app.close() leaves the sockets
 * open and Jest never exits.
 */
export async function createRouteReadingApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [DiscoveryModule, AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.enableShutdownHooks();
  await app.init();

  return app;
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
    metatype,
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
      return [{ key: `${controller.name}.${name}`, handler: handler }];
    });
}

/** Every route in the app, with the controller it belongs to. */
export function routesOf(app: INestApplication): Route[] {
  return app
    .get(DiscoveryService)
    .getControllers()
    .flatMap((wrapper) => {
      const controller = controllerOf(wrapper);
      if (!controller) return [];
      return routeHandlersOf(controller).map((route) => ({
        ...route,
        controller,
      }));
    });
}
