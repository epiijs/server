import http from 'node:http';
import path from 'node:path';

import type { IAppConfig } from '@epiijs/config';
import {
  HttpMethod, OutgoingMessage
} from '@epiijs/httply';
import type { IServiceLocator } from '@epiijs/inject';
import createFindMyWayRouter from 'find-my-way';

import {
  ComposedHandler, composeHandlers, HandlerFn, IncomingMessageWithParams
} from './handler.js';
import { createLogger } from './logging.js';
import {
  findAllModuleFilePaths, getModuleDirPath, importDeclareModule,
  RegExpForDeclareModuleFileName
} from './require.js';

/**
 * 最简的路由定义
 */
interface IRoute {
  method: HttpMethod;
  path: string;
}

/**
 * Handler 声明结果
 */
type HandlerDeclareResult = {
  routes: IRoute[];
  handlers?: HandlerFn[];
};

/**
 * Handler 声明函数类型
 */
type HandlerDeclareFn = () => HandlerDeclareResult;

interface IRefHandler {
  default: HandlerFn;
  options: HandlerDeclareResult;
}

/**
 * 加载单个 Handler 模块
 */
async function loadHandlerModule({ dirPath, filePath }: {
  dirPath: string;
  filePath: string;
}): Promise<IRefHandler | undefined> {
  const handlerModule = await importDeclareModule<HandlerFn, HandlerDeclareResult>(filePath);
  const {
    default: maybeHandlerFn,
    options: maybeDeclare
  } = handlerModule || {};
  const relativePath = path.relative(dirPath, filePath);
  if (typeof maybeHandlerFn !== 'function') {
    const logger = createLogger();
    logger.error(`handler.default should be function at ${relativePath}`);
    return;
  }
  const defaultPath = '/' + relativePath.replace(RegExpForDeclareModuleFileName, '');
  const routes: IRoute[] = maybeDeclare
    // 优先使用 declare() 定义的路由声明
    ? maybeDeclare.routes.map(e => ({ method: e.method as HttpMethod, path: e.path.replace(/\$/g, ':') }))
    // 否则使用默认的推导自文件系统的 GET 路由声明
    : [{ method: 'GET' as HttpMethod, path: defaultPath.replace(/\$/g, ':') }];
  const refHandler: IRefHandler = {
    default: maybeHandlerFn,
    options: {
      routes,
      handlers: maybeDeclare?.handlers
    }
  };
  return refHandler;
}

/**
 * 查找并加载所有 Handler 模块
 */
async function findAllHandlers(config: IAppConfig): Promise<IRefHandler[]> {
  const handlerDirPath = getModuleDirPath(config, 'handlers');
  const moduleFilePaths = (await findAllModuleFilePaths(handlerDirPath, '*.{js,mjs}')).sort();
  const handlers: IRefHandler[] = [];
  for (const handlerFilePath of moduleFilePaths) {
    const handler = await loadHandlerModule({
      dirPath: handlerDirPath,
      filePath: handlerFilePath
    });
    if (handler) {
      handlers.push(handler);
    }
  }
  // TODO: watch & load new handlers
  return handlers;
}

/**
 * 启动路由子系统
 */
async function startRouting(config: IAppConfig): Promise<{
  handleRequest: (request: http.IncomingMessage, response: http.ServerResponse, serviceLocator: IServiceLocator) => Promise<void>;
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
    const composed: ComposedHandler = composeHandlers(handler.options.handlers || [], handler.default);
    handler.options.routes.forEach(route => {
      router.on(route.method, route.path, noopHandler, composed);
    });
  });

  return {
    handleRequest: async (request, response, serviceLocator): Promise<void> => {
      if (!request.url) {
        request.url = '/';
      }
      const findResult = router.find(request.method as HttpMethod, request.url);
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
        createLogger().warn(`route not found: ${request.method} ${request.url}`);
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
  startRouting
};

export type {
  HandlerDeclareFn,
  HandlerDeclareResult
};
