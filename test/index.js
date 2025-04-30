import assert from 'assert';

import { startServer } from '../build/index.js';

describe('@epiijs/server startup', () => {
  let serverInstance = undefined;
  
  it('should start server', async () => {
    const { httpServer } = await startServer({
      root: './fixtures'
    });
    serverInstance = httpServer;
    assert.ok(httpServer);
  });
});