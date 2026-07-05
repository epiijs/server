import http from 'node:http';
import path from 'node:path';

import { IAppConfig } from '@epiijs/config';
import {
  HTTPMethod, OutgoingMessage
} from '@epiijs/httply';
import type { ServiceLocator } from '@epiijs/inject';
import createFindMyWayRouter from 'find-my-way';

import {
  ComposedHandler, composeHandlers, HandlerFn, IncomingMessageWithParams
} from './handler.js';
import { createLogger } from './logging.js';
import {
  findAllModuleFiles, getModuleDirPath, importModule
} from './require.js';

interface IRoute {
  method: HTTPMethod;
  path: string;
}

type HandlerDeclareResult = {
  routes: IRoute[];
  stacks?: HandlerFn[];
};

interface IRefHandler {
  default: HandlerFn;
  options: {
    routes: IRoute[];
    stacks: HandlerFn[];
  };
}

async function loadHandlerModule({ dirName, fileName }: {
  dirName: string;
  fileName: string;
}): Promise<IRefHandler | undefined> {
  interface IHandlerModule {
    default: HandlerFn;
    declare?: () => HandlerDeclareResult;
  }
  const relativePath = path.relative(dirName, fileName);
  const handlerModule = await importModule(fileName) as IHandlerModule;
  const {
    default: maybeHandlerFn,
    declare
  } = handlerModule;
  if (typeof maybeHandlerFn !== 'function') {
    const logger = createLogger();
    logger.error(`handler.default should be function at ${relativePath}`);
    return;
  }
  const maybeDeclare = typeof declare === 'function' ? declare() : undefined;
  const defaultPath = '/' + relativePath.replace(/\/?index\.js$/, '');

  // declare() 存在时使用声明的路由，否则使用文件系统兜底
  const routes: IRoute[] = maybeDeclare
    ? maybeDeclare.routes.map(e => ({ method: e.method as HTTPMethod, path: e.path.replace(/\$/g, ':') }))
    : [{ method: 'GET' as HTTPMethod, path: defaultPath.replace(/\$/g, ':') }];

  const refHandler: IRefHandler = {
    default: maybeHandlerFn,
    options: {
      routes,
      stacks: maybeDeclare?.stacks || []
    }
  };
  return refHandler;
}

async function findAllHandlers(config: IAppConfig): Promise<IRefHandler[]> {
  const handlerDir = getModuleDirPath(config, 'handlers');
  const handlerFileNames = await findAllModuleFiles(handlerDir);
  const handlers: IRefHandler[] = [];
  for (const handlerFileName of handlerFileNames) {
    const handler = await loadHandlerModule({
      dirName: handlerDir,
      fileName: handlerFileName
    });
    if (handler) {
      handlers.push(handler);
    }
  }
  // TODO: watch & load new handlers
  return handlers;
}

async function mountRouting(config: IAppConfig): Promise<{
  handleRequest: (request: http.IncomingMessage, response: http.ServerResponse, serviceLocator: ServiceLocator) => Promise<void>;
  disposeRouter: () => void;
}> {
  const router = createFindMyWayRouter({
    ignoreTrailingSlash: true
  });

  // 注册路由：ComposedHandler 签名与 find-my-way 的 handler 不兼容，存入 store
  // 请求时通过 router.find() 取出 store 中的 ComposedHandler 执行
  const noopHandler = (): void => {};
  const handlers = await findAllHandlers(config);
  handlers.forEach(handler => {
    const composed: ComposedHandler = composeHandlers(handler.options.stacks, handler.default);
    handler.options.routes.forEach(route => {
      router.on(route.method, route.path, noopHandler, composed);
    });
  });

  return {
    handleRequest: async (request, response, serviceLocator): Promise<void> => {
      if (!request.url) {
        request.url = '/';
      }
      const findResult = router.find(request.method as HTTPMethod, request.url);
      let outgoingMessage: OutgoingMessage;
      if (findResult) {
        const { params, store } = findResult;
        const composed = store as ComposedHandler;
        const message = new IncomingMessageWithParams(request, params as Record<string, string>);
        try {
          const result = await composed(message, serviceLocator);
          outgoingMessage = OutgoingMessage.from(result);
        } catch (error) {
          createLogger().error(error);
          outgoingMessage = new OutgoingMessage({ status: 500 });
        }
      } else {
        outgoingMessage = new OutgoingMessage({ status: 404 });
      }
      await outgoingMessage.applyToResponse(response);
    },

    disposeRouter: () => {
      router.reset();
    }
  };
}

export {
  mountRouting
};

export type {
  HandlerDeclareResult
};
