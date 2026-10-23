import { createServer } from 'node:http';
import { Writable } from 'node:stream';

import { pinoHttp } from 'pino-http';
import request from 'supertest';

import { requestLogOptions } from './request-log';

/** The production request log, its lines kept as parsed JSON. */
function production() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      done();
    },
  });
  const log = pinoHttp(requestLogOptions('production'), stream);

  // A handler that logs once while the request is open, as a service's
  // Nest logger does through nestjs-pino.
  const server = createServer((req, res) => {
    log(req, res);
    req.log.info('Looked something up');
    res.end();
  });

  return { lines, server };
}

describe('the request log (#193)', () => {
  it('keeps the request in full to its own line, and its id on every line', async () => {
    const { lines, server } = production();

    const answer = await request(server)
      .get('/v1/orders?search=Wang%20Fang')
      .set('Cookie', 'session=secret')
      .set('X-Api-Revision', '1');
    const id = answer.headers['x-request-id'];
    expect(id).toBeTruthy();

    const during = lines.find((line) => line.msg === 'Looked something up');
    expect(during).toMatchObject({ reqId: id });
    expect(during).not.toHaveProperty('req');
    expect(JSON.stringify(during)).not.toContain('Wang');

    const own = lines.find((line) => line.msg === 'request completed');
    expect(own).toMatchObject({
      reqId: id,
      req: {
        id,
        url: '/v1/orders?search=Wang%20Fang',
        headers: { 'x-api-revision': '1' },
      },
    });
    // ADR-011: the session never reaches the log, on any line.
    expect(JSON.stringify(lines)).not.toContain('secret');
  });

  it('takes the id a request brings with it', async () => {
    const { lines, server } = production();

    await request(server).get('/v1/home').set('X-Request-Id', 'from-the-edge');

    expect(lines.map((line) => line.reqId)).toEqual([
      'from-the-edge',
      'from-the-edge',
    ]);
  });
});
