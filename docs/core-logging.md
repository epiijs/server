# Core: 日志机制

> 状态：草案 | 涉及版本：V4

## 概述

日志是框架的基础设施。V4 目标：提供统一的日志器入口，支持外部自定义写逻辑，通过 Service 机制让 Handler 和框架内部共用同一实例。

## 核心概念

| 概念 | 职责 |
|------|------|
| **ILogger** | 日志器接口，任意属性访问均返回 LoggerFn（Proxy 实现） |
| **appLogger** | 框架内置的 Process 级 Service，实现 ILogger |
| **createLogger** | 获取日志器单例的工厂函数，无参数 |
| **setTransport** | 独立导出函数，覆盖日志写逻辑 |

## ILogger 接口

```typescript
/** 日志写函数，通用签名 */
type LoggerFn = (...args: unknown[]) => void;

interface ILogger {
  /** 常用方法，显式声明以保证 IDE 自动补全 */
  log: LoggerFn;
  info: LoggerFn;
  warn: LoggerFn;
  error: LoggerFn;
  debug: LoggerFn;
  /** 索引签名，支持任意属性名访问 */
  [key: string]: LoggerFn;
}
```

任意属性访问均返回 LoggerFn，方法名作为第一个参数传递：

```typescript
logger.log('message');    // → transport('log', 'message')
logger.info('message');   // → transport('info', 'message')
logger.error('message');  // → transport('error', 'message')
logger.custom('message'); // → transport('custom', 'message')
```

transport 可根据方法名分流处理。

## 单例机制

`createLogger` 无参数，返回唯一单例，内部使用 Proxy 实现：

```typescript
// logging.ts
const Internal: {
  instance: ILogger | undefined;
  transport: LoggerFn;
} = {
  instance: undefined,
  transport: (method, ...args) => {
    const consoleFn = (console as unknown as Record<string, (...a: unknown[]) => void>)[method as string];
    if (typeof consoleFn === 'function') {
      consoleFn(...args);
    } else {
      console.log(...args);
    }
  }
};

function createLogger(): ILogger {
  if (!Internal.instance) {
    Internal.instance = new Proxy({} as ILogger, {
      get(_target, prop) {
        if (typeof prop === 'string') {
          return (...args: unknown[]) => Internal.transport(prop, ...args);
        }
      }
    });
  }
  return Internal.instance;
}

function setTransport(fn: LoggerFn): void {
  Internal.transport = fn;
}
```

- 默认 transport 根据方法名选择对应的 `console.*` API（如 `error` → `console.error`），未匹配时兜底 `console.log`
- Proxy 拦截任意属性访问，返回调用 `transport` 的函数
- 框架内部各模块直接调用 `createLogger()` 即可
- `transport` 和 `instance` 存储在 Internal 命名空间 const 中，所有引用共享

## appLogger Service

appLogger 注册为 Process 级 Service，Handler 通过 `this.appLogger` 获取：

```typescript
// startup.ts
processInjector.provide('appLogger', createLogger());

// Handler 中使用
export default async function (this: ServiceLocator, message: IncomingMessageWithParams) {
  this.appLogger.log('processing request', message.url);
  this.appLogger.error('something went wrong');
  // ...
}
```

## 可插拔写逻辑

业务在入口文件中显式 import `setTransport` 覆盖写逻辑：

```typescript
// 入口文件（如 app.ts）
import winston from 'winston';
import { setTransport } from '@epiijs/server';

const winstonLogger = winston.createLogger({ /* ... */ });

setTransport((method, ...args) => {
  // 根据方法名分流到不同级别
  const level = ['error', 'warn', 'info', 'log', 'debug'].includes(method) ? method : 'info';
  winstonLogger.log(level, args.join(' '));
});
```

`setTransport` 可多次调用，最后一次调用生效。

### 安全边界

- `ILogger` 接口不包含 `setTransport`，Handler 中 `this.appLogger` 无法覆盖写逻辑
- `setTransport` 作为独立函数导出，仅在入口文件显式 import 时使用
- 框架内部模块不 import `setTransport`，仅使用 `createLogger()`

### 静默模式

如需静默，传空函数即可：

```typescript
setTransport(() => {});
```

## 框架内部使用

框架内部各模块通过 `createLogger()` 获取单例：

```typescript
// routing.ts
import { createLogger } from './logging.js';

async function mountRouting(config: IAppConfig) {
  const logger = createLogger();
  logger.log('routing mounted');
}

// service.ts
import { createLogger } from './logging.js';

async function mountService(config: IAppConfig) {
  const logger = createLogger();
  logger.log('service mounted');
}
```

mountRouting 和 mountService 不再需要 logger 参数。

## 启动流程中的位置

```
业务入口
  → setTransport(customFn)           // 可选，覆盖写逻辑

startServer
  → verifyConfig
  → mountRouting(config)                 // 内部 createLogger() 获取单例
  → mountService(config)                 // 内部 createLogger() 获取单例
  → processInjector.provide('appLogger', createLogger())  // 注册为 Service
  → createServer
```

业务在 startServer 之前或之后的任意时机调用 `setTransport(...)` 均可生效。
