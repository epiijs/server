import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import http from 'node:http';
import path from 'node:path';

import { importConfig } from '@epiijs/config';

import { startServer } from '../build/index.js';

function request(port, method, path) {
  return new Promise((resolve, reject) => {
    const clientRequest = http.request({ hostname: 'localhost', port, method, path }, (serverResponse) => {
      let data = '';
      serverResponse.on('data', chunk => { data += chunk; });
      serverResponse.on('end', () => resolve({ status: serverResponse.statusCode, body: data, headers: serverResponse.headers }));
    });
    clientRequest.on('error', reject);
    clientRequest.end();
  });
}

describe('routing', () => {
  let httpServer;
  const port = 3002;

  beforeAll(async () => {
    const config = await importConfig({
      appRoot: path.resolve('./test/fixtures'),
      appPort: 3002,
      envData: {}
    });
    const result = await startServer(config);
    httpServer = result.httpServer;
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(() => {
    if (httpServer) {
      httpServer.close();
    }
  });

  it('filesystem fallback: GET /not-declare returns ok', async () => {
    const response = await request(port, 'GET', '/not-declare');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body, 'ok');
  });

  it('declare() route: GET /users returns list', async () => {
    const response = await request(port, 'GET', '/users');
    assert.strictEqual(response.status, 200);
    const data = JSON.parse(response.body);
    assert.ok(Array.isArray(data));
    assert.strictEqual(data[0].name, 'Alice');
  });

  it('declare() route with params: GET /users/42 returns user', async () => {
    const response = await request(port, 'GET', '/users/42');
    assert.strictEqual(response.status, 200);
    const data = JSON.parse(response.body);
    assert.strictEqual(data.id, '42');
    assert.strictEqual(data.name, 'Alice');
  });

  it('catch-all 404: GET /unknown returns 404', async () => {
    const response = await request(port, 'GET', '/unknown');
    assert.strictEqual(response.status, 404);
    assert.ok(response.body.includes('not found'));
  });

  it('module entry: non-index file with declare() registers route', async () => {
    const response = await request(port, 'GET', '/declared-nonindex');
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body, 'declared nonindex');
  });

  it('module entry: plain non-index module without declare() is not registered', async () => {
    const response = await request(port, 'GET', '/plain');
    assert.strictEqual(response.status, 404);
  });

  it('module discovery: non-index .mjs service registers under its declared name', async () => {
    const response = await request(port, 'GET', '/clock');
    assert.strictEqual(response.status, 200);
    assert.deepStrictEqual(JSON.parse(response.body), { label: 'from-mjs' });
  });

  it('builtin reserved name: business service cannot override appConfig', async () => {
    const response = await request(port, 'GET', '/app-config');
    assert.strictEqual(response.status, 200);
    const data = JSON.parse(response.body);
    assert.strictEqual(data.appRoot, path.resolve('./test/fixtures'));
  });

  it('builtin reserved name: Session scoped service cannot shadow appConfig either', async () => {
    const response = await request(port, 'GET', '/app-config-session');
    assert.strictEqual(response.status, 200);
    const data = JSON.parse(response.body);
    assert.strictEqual(data.hijacked, false);
  });

  it('handler throws error → 500 response', async () => {
    const response = await request(port, 'GET', '/throw');
    assert.strictEqual(response.status, 500);
  });

  it('unregistered service name: container throws, routed as 500', async () => {
    const response = await request(port, 'GET', '/missing-service');
    assert.strictEqual(response.status, 500);
  });

  it('onion chain: handlers + default execute correctly', async () => {
    const response = await request(port, 'GET', '/users');
    assert.strictEqual(response.status, 200);
  });
});
