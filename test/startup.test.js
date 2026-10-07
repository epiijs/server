import { describe, it, beforeAll, afterAll } from 'vitest';
import assert from 'node:assert';
import path from 'node:path';

import { importConfig } from '@epiijs/config';

import { startServer } from '../build/index.js';

describe('startup', () => {
  let httpServer;

  beforeAll(async () => {
    const config = await importConfig({
      appRoot: path.resolve('./test/fixtures'),
      appPort: 3001,
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

  it('should start server', () => {
    assert.ok(httpServer);
  });
});
