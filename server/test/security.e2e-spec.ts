import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/create-test-app';

/**
 * These are security controls, not cosmetics. Middleware ordering changes and
 * dependency bumps can drop them silently — a header that stops being sent
 * looks exactly like a header that was never needed.
 */
describe('Security headers (e2e)', () => {
    let app: INestApplication;
    
    beforeAll(async () => {
        app = await createTestApp();
    });
    
    afterAll(async () => {
        await app.close();
    });
    
    it('does not advertise the framework', async () => {
        const res = await request(app.getHttpServer()).get('/health');
        // Express sets this by default; helmet removes it. Free reconnaissance
        // for anyone fingerprinting the stack.
        expect(res.headers['x-powered-by']).toBeUndefined();
    });
    
    it('sets the headers helmet exists to set', async () => {
        const res = await request(app.getHttpServer()).get('/health');
        
        expect(res.headers['content-security-policy']).toBeDefined();
        expect(res.headers['strict-transport-security']).toContain('max-age=');
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['referrer-policy']).toBe('no-referrer');
    });
    
    it('returns a correlation id the client can quote in a bug report', async () => {
        const res = await request(app.getHttpServer()).get('/health');
        expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });
    
    it('honours a caller-supplied request id instead of replacing it', async () => {
        const res = await request(app.getHttpServer())
            .get('/health')
            .set('x-request-id', 'trace-me-please');
        
        // Preserves the id across service hops, so one trace spans the whole call.
        expect(res.headers['x-request-id']).toBe('trace-me-please');
    });
});