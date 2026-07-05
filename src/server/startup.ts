import http, { Server } from 'node:http';

import verifyConfig, {
  IMaybeAppConfig
} from '@epiijs/config';

import { createLogger } from './logging.js';
import { mountRouting } from './routing.js';
import { mountService } from './service.js';

interface IStartupResult {
  httpServer: Server;
}

async function startServer(config: IMaybeAppConfig): Promise<IStartupResult> {
  const verifiedConfig = verifyConfig(config);
  const logger = createLogger();

  const {
    handleRequest,
    disposeRouter
  } = await mountRouting(verifiedConfig);
  const {
    createProcessInjector,
    createSessionInjector
  } = await mountService(verifiedConfig);

  const processInjector = createProcessInjector();
  processInjector.provide('appConfig', verifiedConfig);
  processInjector.provide('appLogger', logger);

  const httpServer = http.createServer((request, response) => {
    const sessionInjector = createSessionInjector(processInjector);

    handleRequest(request, response, sessionInjector.service() as Record<string, unknown>).catch(error => {
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

  const serverPort = verifiedConfig.port.server;
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
