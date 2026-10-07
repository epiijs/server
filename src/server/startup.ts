import http, { Server } from 'node:http';

import type { IAppConfig } from '@epiijs/config';

import { createLogger } from './logging.js';
import { startRouting } from './routing.js';
import { startServiceManager } from './service.js';

interface IStartupResult {
  httpServer: Server;
}

async function startServer(config: IAppConfig): Promise<IStartupResult> {
  const logger = createLogger();

  const {
    handleRequest,
    disposeRouter
  } = await startRouting(config);
  const {
    createProcessInjector,
    createSessionInjector
  } = await startServiceManager(config, {
    builtin: {
      appConfig: config,
      appLogger: logger
    }
  });

  const processInjector = createProcessInjector();
  const httpServer = http.createServer((request, response) => {
    const sessionInjector = createSessionInjector(processInjector);
    handleRequest(request, response, sessionInjector.service()).catch(error => {
      logger.error(error);
    }).finally(() => {
      sessionInjector.dispose();
    });
  });

  httpServer.on('close', () => {
    processInjector.dispose();
    disposeRouter();
    logger.info('server closed');
  });

  const serverPort = config.appPort;
  httpServer.listen(serverPort, () => {
    logger.info(`server started on port ${serverPort}`);
  });

  return {
    httpServer
  };
}

export {
  startServer
};

export type {
  IStartupResult
};
