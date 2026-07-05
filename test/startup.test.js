import assert from 'assert';

import { startServer } from '../build/index.js';

describe('startup', () => {
  let httpServer;

  beforeAll(async () => {
    const result = await startServer({ root: './test/fixtures' });
    httpServer = result.httpServer;
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterAll(() => {
    if (httpServer) {
      httpServer.close();
    }
  });

  it('should start server', () => {
    assert.ok(httpServer);
  });
});
