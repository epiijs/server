# @epiijs/server

A simple server framework.

- Koa-like pipeline
- file-system based routing
- handler chain with stacks
- service dependency injection
- pluggable logging

`v4.x` is only for ES module.

# Install

```bash
npm i @epiijs/server --save
```

# Usage

## project like this

```sh
(root)
├─ src
│  ├─ handlers
│  │  ├─ users
│  │  │  └─ index.ts
│  │  └─ index.ts
│  └─ services
│     └─ userService.ts
└─ start.ts
```

will route requests like this

```
=> /users    (declare routes)
=> /         (filesystem fallback)
```

## start server

```ts
import { startServer } from '@epiijs/server';

startServer({
  root: __dirname // or getDirNameByImportMeta(import.meta)
});
```

## handle request by *handler*

Provide request handlers in `/handlers`. Recommend using `declare` to explicitly register routes:

```ts
import {
  HandlerDeclareResult,
  HandlerResult,
  IncomingMessageWithParams,
  ServiceLocator
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
  this: ServiceLocator,
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

## filter pipeline by handler chain

Use `stacks` in `declare()` to compose handler chain (Koa-like onion model):

```ts
import {
  HandlerDeclareResult,
  HandlerFn,
  HandlerResult,
  IncomingMessageWithParams,
  ServiceLocator
} from '@epiijs/server';

async function withMethodCheck(
  this: ServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
): Promise<HandlerResult> {
  if (message.method !== 'GET') {
    return { status: 405, content: 'method not allowed' };
  }
  return next();
}

async function withTiming(
  this: ServiceLocator,
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
    stacks: [withTiming, withMethodCheck]
  };
}

export default async function (
  this: ServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  return 'hello world';
}
```

## inject *service* as dependency

Provide service factory in `/services`.

```ts
export interface IUserService {
  findUsers: () => Promise<IUser[]>;
}

export default function (services: ServiceLocator): IUserService {
  return {
    findUsers: async () => []
  };
}
```

Access service via `this` (bound as ServiceLocator) in handler:

```ts
import {
  HandlerResult,
  IncomingMessageWithParams,
  ServiceLocator
} from '@epiijs/server';

export default async function (
  this: ServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  const userService = this.userService as IUserService;
  const users = await userService.findUsers();
  return users;
}
```

## customize logging

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
  this: ServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  this.appLogger.info('processing request', message.url);
  return 'ok';
}
```

## Migration from V3

### directory

```
actions/   →  handlers/
```

### handler signature

```ts
// V3
export default async function (props: IncomingMessage, context: Context): Promise<ActionResult> {
  const userService = await context.useService('UserService');
  const config = context.getAppConfig();
  // ...
}

// V4
export default async function (
  this: ServiceLocator,
  message: IncomingMessageWithParams
): Promise<HandlerResult> {
  const userService = this.userService as IUserService;
  const config = this.appConfig as IAppConfig;
  // ...
}
```

### pipeline (useHandler → stacks)

```ts
// V3
await context.useHandler(dispose => {
  const start = Date.now();
  if (message.method !== 'GET') {
    return { status: 405, content: 'method not allowed' };
  }
  dispose(() => console.log('elapsed', Date.now() - start));
});

// V4 — declare stacks
async function withMethodCheck(this: ServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  if (message.method !== 'GET') {
    return { status: 405, content: 'method not allowed' };
  }
  return next();
}

async function withTiming(this: ServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  const start = Date.now();
  const result = await next();
  console.log('elapsed', Date.now() - start);
  return result;
}

export function declare() {
  return {
    routes: [{ method: 'GET', path: '/hello' }],
    stacks: [withTiming, withMethodCheck]
  };
}
```

### early return

```ts
// V3
throw new BreakActionError({ status: 403, content: 'forbidden' });

// V4 — return directly, do not call next()
return { status: 403, content: 'forbidden' };
```

### type renames

| V3 | V4 |
|----|----|
| `ActionResult` | `HandlerResult` |
| `ActionFn` | `HandlerFn` |
| `ActionDeclareResult` | `HandlerDeclareResult` |
| `Context` | removed |

## Document

* [error handling via stacks](./docs/core-handler.md#错误处理)
* [declare handler and service](./docs/core-handler.md#handler-与路由的关系)
