# @epiijs/server

[中文](README.md)

A simple server framework.

- Explicit `declare()` for module discovery
- Koa-like pipeline
- File-system based routing (not recommended)
- Service dependency injection
- Pluggable logging

`v4.x` is only for ES module.

# Install

```bash
npm i @epiijs/server --save
```

# Usage

## Project like this

```sh
(root)
├─ src
│  ├─ handlers
│  │  ├─ users
│  │  │  └─ index.ts
│  │  └─ index.ts
│  └─ services
│     └─ userService
│        └─ index.ts
└─ start.ts
```

Which routes requests like this

```
=> /users    (declare routes)
=> /         (filesystem fallback)
```

## Start server

`startServer` receives the fully resolved `IAppConfig`.

```ts
import { getDirNameByImportMeta, importConfig } from '@epiijs/config';
import { startServer } from '@epiijs/server';

const config = await importConfig({
  appRoot: getDirNameByImportMeta(import.meta)
});
startServer(config);
```

## Handle request by *handler*

Handlers are provided under `/handlers` by convention. Use `declare` to register routes explicitly:

```ts
import {
  HandlerDeclareResult,
  HandlerResult,
  IncomingMessageWithParams,
  IServiceLocator
} from '@epiijs/server';

export function declare(): HandlerDeclareResult {
  return {
    routes: [
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/users/:id' }
    ]
  };
}

export default async function (
  this: IServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  const { method, params } = message;

  // simple response
  return 'hello world';

  // custom response
  return {
    status: 400,
    headers: { 'content-type': 'application/json' },
    content: JSON.stringify({})
  };
}
```

## Compose pipeline by handler chain

Use `handlers` in `declare()` to compose the handler chain (Koa-like onion model):

```ts
import {
  HandlerDeclareResult,
  HandlerFn,
  HandlerResult,
  IncomingMessageWithParams,
  IServiceLocator
} from '@epiijs/server';

async function withTiming(
  this: IServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
): Promise<HandlerResult> {
  const start = Date.now();
  const result = await next();
  console.log('elapsed', Date.now() - start);
  return result;
}

export function declare(): HandlerDeclareResult {
  return {
    routes: [{ method: 'GET', path: '/hello' }],
    handlers: [withTiming]
  };
}

export default async function (
  this: IServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  return 'hello world';
}
```

## Inject *service* as dependency

Provide the service factory under `/services`.

```ts
export interface IUserService {
  findUsers: () => Promise<IUser[]>;
}

export default function (services: IServiceLocator): IUserService {
  return {
    findUsers: async () => []
  };
}
```

Access service via `this` (bound as IServiceLocator) in handler:

```ts
import {
  HandlerResult,
  IncomingMessageWithParams,
  IServiceLocator
} from '@epiijs/server';

export default async function (
  this: IServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  const userService = this.userService as IUserService;
  const users = await userService.findUsers();
  return users;
}
```

## Custom logger

```ts
import { setTransport } from '@epiijs/server';

setTransport((method, ...args) => {
  // method = 'info' | 'error' | 'warn' | 'debug' | 'log' | ...
  // route to your logger
});
```

Access logger via `this.appLogger` in handler:

```ts
export default async function (
  this: IServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  this.appLogger.info('processing request', message.url);
  return 'ok';
}
```

## Migration from V3

### Directory

```
actions/   →  handlers/
```

### Handler signature

```ts
// V3
export default async function (props: IncomingMessage, context: Context): Promise<ActionResult> {
  const userService = await context.useService('UserService');
  const config = context.getAppConfig();
  // ...
}

// V4
export default async function (
  this: IServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  const userService = this.userService as IUserService;
  const config = this.appConfig as IAppConfig;
  // ...
}
```

### Pipeline (useHandler → handlers)

```ts
// V3
await context.useHandler(dispose => {
  const start = Date.now();
  if (message.method !== 'GET') {
    return { status: 405, content: 'method not allowed' };
  }
  dispose(() => console.log('elapsed', Date.now() - start));
});

// V4: declare handlers
async function withTiming(this: IServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  const start = Date.now();
  const result = await next();
  console.log('elapsed', Date.now() - start);
  return result;
}

export function declare() {
  return {
    routes: [{ method: 'GET', path: '/hello' }],
    handlers: [withTiming]
  };
}
```

### Type renames

| V3 | V4 |
|----|----|
| `ActionResult` | `HandlerResult` |
| `ActionFn` | `HandlerFn` |
| `ActionDeclareResult` | `HandlerDeclareResult` |
| `Context` | removed |
