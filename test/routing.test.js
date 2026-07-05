import assert from 'assert';
import http from 'http';

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
    const result = await startServer({ root: './test/fixtures', port: { server: 3002 } });
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

  it('handler throws error → 500 response', async () => {
    const response = await request(port, 'GET', '/throw');
    assert.strictEqual(response.status, 500);
  });

  it('onion chain: stacks + default execute correctly', async () => {
    const response = await request(port, 'GET', '/users');
    assert.strictEqual(response.status, 200);
  });
});
