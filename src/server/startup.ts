import http, { Server } from 'http';

import verifyConfig, { IAppConfig, IMaybeAppConfig } from '@epiijs/config';

import { buildLogging } from './logging.js';
import { buildContext } from './context.js';
import { mountRouting } from './routing.js';
import { mountService } from './service.js';

interface IContextForStartup {
  getAppConfig: () => IAppConfig;
}

interface IStartupResult {
  httpServer: Server;
}

export async function startServer(config: IMaybeAppConfig): Promise<IStartupResult> {
  const verifiedConfig = verifyConfig(config);
  const logging = buildLogging(verifiedConfig);

  const {
    handleRequest,
    disposeRouter
  } = await mountRouting(verifiedConfig);
  const {
    buildInjectorForProcess,
    buildInjectorForSession
  } = await mountService(verifiedConfig);
  
  const processInjector = buildInjectorForProcess();

  const httpServer = http.createServer((request, response) => {
    const context = buildContext();

    context.install('getAppConfig', () => {
      return Object.freeze(verifiedConfig);
    }, undefined);

    const sessionInjector = buildInjectorForSession(processInjector, context);

    handleRequest(request, response, context).catch(error => {
      logging.error(error);
    }).finally(() => {
      sessionInjector.dispose();
      context.dispose();
    });
  });

  httpServer.on('close', () => {
    processInjector.dispose();
    disposeRouter();
    logging.info('server closed');
  });

  const serverPort = verifiedConfig.port.server;
  httpServer.listen(serverPort, () => {
    logging.info(`server started on port ${serverPort}`);
  });

  return {
    httpServer
  };
}

export type {
  IContextForStartup,
  IStartupResult
};
