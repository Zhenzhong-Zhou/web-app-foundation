import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';

import type { Event } from '@sentry/node';

const SERVER = resolve(__dirname, '..', '..', '..');
const TRACKER = join(__dirname, 'tracker');

/** The events the stub tracker has received. */
let received: Event[];

/** A tracker on this machine, which records each event it is sent. */
const stub = createServer((request, response) => {
  let body = '';
  request.setEncoding('utf8');
  request.on('data', (chunk: string) => (body += chunk));
  request.on('end', () => {
    const lines = body.split('\n');
    for (let i = 1; i < lines.length; i += 2) {
      const item = JSON.parse(lines[i]) as { type: string };
      if (item.type === 'event') {
        received.push(JSON.parse(lines[i + 1]) as Event);
      }
    }
    response.writeHead(200).end('{}');
  });
});

/** Starts the tracker in a node of its own, meets the fault, and exits. */
async function exitCodeAfter(fault: string): Promise<number | null> {
  const { port } = stub.address() as AddressInfo;
  const child = spawn(
    process.execPath,
    [
      '--require',
      'ts-node/register/transpile-only',
      '--eval',
      `require(${JSON.stringify(TRACKER)}).startTracker({
        ERROR_TRACKER_DSN: 'http://publickey@127.0.0.1:${port}/1',
        NODE_ENV: 'test',
      });
      ${fault}`,
    ],
    { cwd: SERVER, stdio: 'ignore' },
  );
  const [code] = (await once(child, 'exit')) as [number | null];
  return code;
}

/**
 * ADR-084: the SDK's own handlers report an uncaught exception or an
 * unhandled rejection, then end the process as Node would, with exit code
 * 1, so Render restarts it. In a child process, since the fault ends it.
 */
describe("the error tracker's exit (ADR-084)", () => {
  beforeAll(async () => {
    stub.listen(0, '127.0.0.1');
    await once(stub, 'listening');
  });

  afterAll(() => stub.close());

  beforeEach(() => {
    received = [];
  });

  it.each([
    [
      'an uncaught exception',
      "setTimeout(() => { throw new Error('the disk is full'); });",
    ],
    [
      'an unhandled rejection',
      "void Promise.reject(new Error('the disk is full'));",
    ],
  ])('reports %s once, then exits with 1', async (_case, fault) => {
    expect(await exitCodeAfter(fault)).toBe(1);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      tags: { side: 'server' },
      exception: { values: [{ type: 'Error', value: 'the disk is full' }] },
    });
  });
});
