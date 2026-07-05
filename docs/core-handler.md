# Core: 管线机制

> 状态：已批准 | 涉及版本：V4

## 概述

管线机制采用 Koa-like 模型，通过 Handler 链处理请求。Handler 是唯一的处理单元，通过 `next()` 控制流实现前置拦截和后置清理。

## 核心概念

两个核心概念：

| 概念 | 职责 |
|------|------|
| **Handler** | 管线处理函数，Koa 风格洋葱链 |
| **Service** | 依赖注入，管理公共机制的实例化生命周期 |

路由是框架内部的全局机制，不需要开发者自定义。

## Handler

Handler 是管线的唯一处理单元。采用 Koa-like 模型，通过 `next()` 控制流实现前置拦截和后置清理。

```typescript
// IncomingMessageWithParams 继承 httply 的 IncomingMessage，在 server 层扩展路由参数
class IncomingMessageWithParams extends IncomingMessage {
  readonly params: Record<string, string>;
  constructor(raw: http.IncomingMessage, params: Record<string, string>) {
    super(raw);
    this.params = params;
  }
}

// HandlerFn 是 Handler 的类型签名
type HandlerFn = (
  this: ServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
) => Promise<HandlerResult>;
```

Handler 签名的四个要素，各司其职：

| 要素 | 角色 | 可变性 | 来源 |
|------|------|--------|------|
| **`this`** | 能力（ServiceLocator） | 不可变 | 每次请求通过 `.call()` 注入 |
| **`message`** | 输入（IncomingMessageWithParams） | 不可变 | 每次请求生成 |
| **`next`** | 控制流 | — | 框架组合链时注入 |
| **返回值** | 输出（HandlerResult） | 不可变 | Handler 产生 |

**约束**：Handler 函数禁止使用箭头函数，以保证 `this` 绑定正常工作。

### 洋葱模型

```
请求入站
  → Handler 1（前置逻辑）
    → Handler 2（前置逻辑）
      → Handler 3（业务逻辑，不调用 next）
    ← Handler 2（后置逻辑）
  ← Handler 1（后置逻辑）
← 响应出站
```

- 调用 `next()` — 将控制权交给下一个 Handler，等待其返回
- 不调用 `next()` — 提前返回响应，后续 Handler 不执行
- `await next()` 之后 — 后置清理逻辑

### 示例

```typescript
// 前置检查 + 后置日志
async function withTiming(this: ServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  const start = Date.now();
  const result = await next();
  console.log('elapsed', Date.now() - start);
  return result;
}

// 前置拦截（提前返回，不调用 next）
async function withMethodCheck(this: ServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  if (message.method !== 'GET') {
    return { status: 405, content: 'method not allowed' };
  }
  return next();
}

// 业务逻辑（链的末端，不调用 next）
export default async function (this: ServiceLocator, message: IncomingMessageWithParams) {
  const userService = this.userService as IUserService;
  const user = await userService.findById(message.params.id);
  return { status: 200, content: JSON.stringify(user) };
}
```

## Handler 与路由的关系

路由是框架内部的全局机制，在 Handler 链执行之前完成匹配。

```
入站请求 → 路由匹配（框架内部）→ Handler 链执行 → 响应出站
```

Handler 模块通过 `declare()` 声明路由和 Handler 链：

```typescript
// handlers/users/index.ts
import { withMethodCheck, withTiming } from '../common-handlers.js';

export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/users/:id' },
      { method: 'POST', path: '/users' },
    ],
    // 每个模块自行决策组合哪些 Handler，框架按数组顺序构建洋葱链
    stacks: [withMethodCheck, withTiming]
  };
}

// default 导出是链的末端（业务逻辑），由框架自动追加到 stacks 数组之后
export default async function (this: ServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
  const userService = this.userService as IUserService;
  const user = await userService.findById(message.params.id);
  return { status: 200, content: JSON.stringify(user) };
}
```

框架执行逻辑：`stacks.concat(default)` 组成完整的洋葱链，每次请求通过 `.call(serviceLocator, ...)` 注入 `this`。

设计要点：
- **不要全局 Handler** — 每个模块自己决策组合哪些
- **不在函数体内内联** — 不方便测试、不可见
- **declare() 中声明** — 链的组合关系清晰可见、可独立测试

## Service

详见 [core-service.md](./core-service.md)。

## 错误处理

错误处理由业务代码实现，通过 `stacks` 最外层包裹整个 Handler 链。框架在路由层提供 500 兜底（日志记录 + 默认 500 响应），如需自定义错误响应，应在 stacks 最外层写 try/catch 或通过 `/*` catch-all 路由处理。

```typescript
async function withErrorHandler(
  this: ServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
) {
  try {
    const result = await next();
    if (result && typeof result === 'object' && 'status' in result && result.status >= 400) {
      return { status: result.status, content: renderErrorPage(result.status) };
    }
    return result;
  } catch (error) {
    return { status: 500, content: renderErrorPage(500) };
  }
}

export function declare(): HandlerDeclareResult {
  return {
    routes: [{ method: 'GET', path: '/users/:id' }],
    stacks: [withErrorHandler, withAuth]  // withErrorHandler 在最外层
  };
}
```

洋葱模型中，最外层 stacks Handler 的 `await next()` 覆盖了所有内层 Handler 的执行，天然适合 try/catch 承接错误。

404（路由未命中）不经过 Handler 链，需通过 `/*` catch-all 路由处理，详见 [core-routing.md](./core-routing.md)。

## 已确认

- `default` 导出必须 — 作为 Handler 链的末端（业务逻辑）
- Handler 禁止箭头函数 — 保证 `this` 绑定
- 不要全局 Handler — 每个模块自行决策组合

## 搁置

- **Controller / 多操作聚合** — V4 不处理，一个 Handler 文件对应一个处理函数。CRUD 聚合需求留待后续版本。
