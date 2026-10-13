import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  RequestMethod,
  StreamableFile,
} from '@nestjs/common';
import { HTTP_CODE_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { ValidateFunction } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import type { Request } from 'express';
import { map, type Observable } from 'rxjs';

/**
 * Every response the e2e suite receives, checked against the contract in
 * server/openapi.json (ADR-068, amended): a field the contract does not
 * declare fails, and so does a declared one missing or of the wrong type.
 * The compiler cannot catch the first: it rejects an extra property on an
 * object literal, not on a spread table row, which is how responses came
 * to send organization ids, pinyin and reminder bookkeeping nobody read.
 *
 * Test-only. Production never loads this file and pays nothing for it. A
 * route whose response the document does not describe yet is skipped, so
 * the check covers each module as it is converted.
 */

type Schema = Record<string, unknown>;

interface MediaType {
  schema?: Schema;
}

interface ResponseObject {
  content?: Record<string, MediaType>;
}

interface Operation {
  responses?: Record<string, ResponseObject>;
}

export interface Document {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, Schema> };
}

const DOCUMENT_ID = 'openapi.json';

const DOCUMENT_FILE = join(__dirname, '..', '..', 'openapi.json');

const reflector = new Reflector();

/**
 * Closes every object schema that lists its properties: what the contract
 * does not name, a response may not send. A schema without a property
 * list describes an open map, and stays open.
 */
export function closed(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closed);
  if (typeof schema !== 'object' || schema === null) return schema;

  const copy: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    copy[key] = closed(value);
  }
  if (
    copy.properties !== undefined &&
    copy.additionalProperties === undefined
  ) {
    copy.additionalProperties = false;
  }
  return copy;
}

/** Points a response's references at the document its components live in. */
function anchored(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(anchored);
  if (typeof schema !== 'object' || schema === null) return schema;

  const copy: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref' && typeof value === 'string' && value.startsWith('#')) {
      copy[key] = DOCUMENT_ID + value;
    } else {
      copy[key] = anchored(value);
    }
  }
  return copy;
}

/**
 * A route as the document names it: Express's `/v1/invoices/:id` is the
 * document's `/v1/invoices/{id}`.
 */
export function documentPath(routePath: string): string {
  return routePath.replace(/:(\w+)/g, '{$1}');
}

/** The JSON schema of one response, or undefined when none is declared. */
function responseSchema(
  document: Document,
  method: string,
  path: string,
  status: number,
): Schema | undefined {
  const operation = document.paths[path]?.[method];
  const response = operation?.responses?.[String(status)];
  return response?.content?.['application/json']?.schema;
}

/**
 * The validator of each response one document declares, by method, path
 * and status: null for a response it does not describe.
 */
export function contractFor(document: Document) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    // The shape is the contract here; uuid and date-time are the server's.
    validateFormats: false,
  });
  ajv.addSchema({ $id: DOCUMENT_ID, components: closed(document.components) });

  const compiled = new Map<string, ValidateFunction | null>();

  return (method: string, path: string, status: number) => {
    const key = `${method} ${path} ${status}`;
    if (!compiled.has(key)) {
      const schema = responseSchema(document, method, path, status);
      const validate = schema
        ? ajv.compile(closed(anchored(schema)) as Schema)
        : null;
      compiled.set(key, validate);
    }
    return compiled.get(key) ?? null;
  };
}

/** The errors, one to a line: where in the body, and what is wrong there. */
export function described(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((error) => {
      const field =
        error.keyword === 'additionalProperties'
          ? ` (${String(error.params.additionalProperty)})`
          : '';
      return `  ${error.instancePath || '/'} ${error.message ?? ''}${field}`;
    })
    .join('\n');
}

/**
 * The status the handler answers with: Nest sets it after the
 * interceptors run, so it is read from the handler, as Nest reads it.
 */
function statusOf(handler: ReturnType<ExecutionContext['getHandler']>) {
  const declared = reflector.get<number | undefined>(
    HTTP_CODE_METADATA,
    handler,
  );
  if (declared !== undefined) return declared;
  const verb = reflector.get<RequestMethod>(METHOD_METADATA, handler);
  return verb === RequestMethod.POST ? 201 : 200;
}

const validatorFor = contractFor(
  JSON.parse(readFileSync(DOCUMENT_FILE, 'utf8')) as Document,
);

/** Checks each JSON response on its way out of the e2e suite's app. */
export class ResponseContractInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const route = request.route as { path?: string } | undefined;
    const handler = context.getHandler();

    return next.handle().pipe(
      map((body: unknown) => {
        // A file or a CSV is not JSON, and an unrouted request has no path.
        const json = typeof body === 'object' && body !== null;
        if (!json || body instanceof StreamableFile || !route?.path) {
          return body;
        }

        const path = documentPath(route.path);
        const method = request.method.toLowerCase();
        const validate = validatorFor(method, path, statusOf(handler));

        // As the client receives it: Dates become strings on the wire.
        if (validate && !validate(JSON.parse(JSON.stringify(body)))) {
          throw new Error(
            `The response of ${request.method} ${path} breaks the API ` +
              `contract (ADR-068). If the API changed on purpose, run npm ` +
              `run api.\n${described(validate)}`,
          );
        }
        return body;
      }),
    );
  }
}
