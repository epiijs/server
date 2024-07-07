import http from 'http';
import path from 'path';

import createFindMyWayRouter, { HTTPVersion, Handler } from 'find-my-way';
import { IAppConfig } from '@epiijs/config';
import { HTTPMethod, IOutgoingMessage, applyOutgoingMessage, buildIncomingMessage, buildOutgoingMessage } from '@epiijs/httply';

import { ActionFnInner, performAction } from './handler.js';
import { findAllModuleFiles, getModuleDirPath, importModule } from './require.js';

interface IRoute {
  method: HTTPMethod;
  path: string;
}

interface IRefAction {
  default: ActionFnInner;
  options: {
    routes: IRoute[];
    global?: 'error';
  };
}

type ActionDeclareResult = IRefAction['options'];
type ActionDeclareFn = () => ActionDeclareResult;

async function loadActionModule({ dirName, fileName }: {
  dirName: string;
  fileName: string;
}): Promise<IRefAction | undefined> {
  interface IActionModule {
    default: ActionFnInner;
    declare?: ActionDeclareFn;
  }
  const relativePath = path.relative(dirName, fileName);
  const actionModule = await importModule(fileName) as IActionModule;
  const {
    default: maybeActionFn,
    declare
  } = actionModule;
  if (typeof maybeActionFn !== 'function') {
    console.error(`action.default should be function at ${relativePath}`);
    return;
  }
  const maybeOptions = typeof declare === 'function' ? declare() : undefined;
  const defaultPath = '/' + relativePath.replace(/\/?index\.js$/, '');
  const refAction: IRefAction = {
    default: maybeActionFn,
    options: {
      ...maybeOptions,
      routes: (maybeOptions?.routes || []).concat([
        { method: 'GET', path: defaultPath }
      ]).map(e => (
        { method: e.method, path: e.path.replace(/\$/g, ':') }
      ))
    }
  };
  return refAction;
}

async function findAllActions(config: IAppConfig): Promise<IRefAction[]> {
  const actionDir = getModuleDirPath(config, 'actions');
  const actionFileNames = await findAllModuleFiles(actionDir);
  const actions: IRefAction[] = [];
  for (const actionFileName of actionFileNames) {
    const action = await loadActionModule({
      dirName: actionDir,
      fileName: actionFileName
    });
    if (action) {
      actions.push(action);
    }
  }
  // TODO: watch & load new actions
  return actions;
}

export async function mountRouting(config: IAppConfig): Promise<{
  handleRequest: (request: http.IncomingMessage, response: http.ServerResponse, context: unknown) => Promise<void>;
  disposeRouter: () => void;
}> {
  const router = createFindMyWayRouter({
    ignoreTrailingSlash: true
  });
  const globalRoutes: Record<string, Handler<HTTPVersion.V1> | undefined> = {
    error: undefined
  };

  const actions = await findAllActions(config);
  actions.forEach(action => {
    const routeFn: Handler<HTTPVersion.V1> = async (request, response, params, context) => {
      const incomingMessage = buildIncomingMessage(request, params);
      const outgoingMessage = await performAction(action.default, incomingMessage, context);
      return outgoingMessage;
    };
    const { routes, global } = action.options;
    routes.forEach(route => {
      // register routes to find-my-way
      router.on(route.method, route.path, routeFn);
      // register global routes
      if (route.method === 'GET' && global) {
        globalRoutes[global] = routeFn;
      }
    });
  });

  return {
    handleRequest: async (request, response, context): Promise<void> => {
      interface IOutgoingMessageWithError extends IOutgoingMessage {
        error?: unknown;
      }

      if (!request.url) { request.url = '/'; }

      const catchError = (error: unknown, status?: number): IOutgoingMessageWithError => {
        const message = buildOutgoingMessage({ status: status || 500 }) as IOutgoingMessageWithError;
        message.error = error;
        return message;
      };

      let outgoingMessage: IOutgoingMessageWithError;

      const findResult = router.find(request.method as HTTPMethod, request.url);
      if (findResult) {
        const { handler, params } = findResult;
        // TODO: find out why find-my-way requires search-params
        outgoingMessage = await handler(request, response, params, context, {}).catch(catchError);
      } else {
        outgoingMessage = catchError(undefined, 404);
      }

      if (globalRoutes.error) {
        // sorry to copy outgoingMessage as fake params type
        const params = outgoingMessage as unknown as Record<string, string>;
        outgoingMessage = await globalRoutes.error(request, response, params, context, {}).catch((error: unknown) => {
          console.error('error occurred in global error action', error);
          return catchError(error);
        });
      }

      if (!outgoingMessage) {
        outgoingMessage = buildOutgoingMessage({ status: 404 });
      }

      return applyOutgoingMessage(outgoingMessage, response);
    },

    disposeRouter: () => {
      router.reset();
    }
  };
}

export type {
  ActionDeclareResult,
  ActionDeclareFn
};
