import type {
  IServiceLocator
} from '@epiijs/inject';

import type {
  IHandlerOptionsForStaticFiles
} from './handlers/index.js';
import handlers from './handlers/index.js';
import type {
  HandlerFn, HandlerResult
} from './server/handler.js';
import {
  IncomingMessageWithParams
} from './server/handler.js';
import type {
  ILogger, LoggerFn
} from './server/logging.js';
import {
  createLogger, setTransport
} from './server/logging.js';
import type {
  HandlerDeclareResult
} from './server/routing.js';
import type {
  ServiceDeclareResult, ServiceFactoryFn
} from './server/service.js';
import {
  EServiceScope
} from './server/service.js';
import {
  startServer
} from './server/startup.js';

export {
  createLogger,
  EServiceScope,
  handlers,
  IncomingMessageWithParams,
  setTransport,
  startServer
};

export type {
  HandlerDeclareResult,
  HandlerFn,
  HandlerResult,
  IHandlerOptionsForStaticFiles,
  ILogger,
  IServiceLocator,
  LoggerFn,
  ServiceDeclareResult,
  ServiceFactoryFn
};

export type {
  HttpMethod, IncomingMessage, OutgoingMessage
} from '@epiijs/httply';
