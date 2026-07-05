import handlers from './handlers/index.js';
import type {
  HandlerFn, HandlerResult
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
  startServer
} from './server/startup.js';

export {
  createLogger,
  handlers,
  setTransport,
  startServer
};

export type {
  HandlerDeclareResult,
  HandlerFn,
  HandlerResult,
  ILogger,
  LoggerFn,
  ServiceDeclareResult,
  ServiceFactoryFn
};

export type {
  HTTPMethod, IncomingMessage, OutgoingMessage
} from '@epiijs/httply';
