---
title: 管线机制
description: Handler 组合与洋葱链的现行实现文档（V4，状态：已批准）
last_updated: 2026-10-07
---

# Core: 管线机制

> 状态：已批准 | 涉及版本：V4

## 概述

管线机制采用 Koa-like 模型，通过 Handler 链处理请求。Handler 是唯一的处理单元，通过 `next()` 控制流实现前置拦截和后置清理。

## 核心概念

两个核心概念：

| 概念 | 职责 |
|------|------|
| **Handler** | 管线处理器。路由与它绑定：路由在模块内确定（`declare()` 声明或按模块路径推导），框架负责匹配 |
| **Service** | 可注入服务，框架管理其实例的生命周期 |

路由在模块内确定，框架只负责匹配：`declare()` 声明 method + path，未声明时按模块路径推导、方法固定 GET。详见 [core-routing.md](./core-routing.md)。

## Handler

Handler 是管线的唯一处理单元：接收不可变输入、产生不可变输出，通过 `next()` 控制流转。

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
  this: IServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
) => Promise<HandlerResult>;
```

Handler 签名的四个要素，各司其职：

| 要素 | 角色 | 来源 |
|------|------|------|
| **`this`** | 能力（IServiceLocator） | 框架构造，每次请求通过 `.call()` 注入 |
| **`message`** | 输入（IncomingMessageWithParams） | 每次请求的入站数据派生 |
| **`next`** | 控制流 | 框架构造，每次请求通过函数参数注入 |
| **返回值** | 输出（HandlerResult） | Handler 产生 |

**约束**：Handler 函数禁止使用箭头函数，以保证 `this` 绑定正常工作。

### 洋葱模型

框架把 `declare().handlers` 指定的与 `default` 导出的 Handler 函数合成为一个管线封装函数：

```
请求入站
  → Handler 1（前置逻辑）
    → Handler 2（前置逻辑）
      → default（业务逻辑，不调用 next）
    ← Handler 2（后置逻辑）
  ← Handler 1（后置逻辑）
← 响应出站
```

- 调用 `next()`，执行权交给当前管线的下一个 Handler，通过 `next()` 获得那个 Handler 的返回值
- 没有下一个 Handler 时，`next()` 返回 `undefined`，204 由 httply 的 falsy 映射产生，管线自身不自造响应
- 不调用 `next()`，管线的后续 Handler 都不执行，使用当前返回值作为响应
- 同一 Handler 内 `next()` 只能调用一次，重复调用抛错
- `await next()` 之后的代码即后置逻辑，替代 V3 的 `dispose` 回调
- 内层（后续）Handler 抛出的错误会沿链向外（向前）传播，见「错误处理」

绑定路由的 Handler 模块必须 `default` 导出函数，作为管线的最终业务逻辑；`default` 非函数的模块记日志跳过，不注册。

### 示例

```typescript
// 前置检查 + 后置日志
async function withTiming(this: IServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  const start = Date.now();
  const result = await next();
  console.log('elapsed', Date.now() - start);
  return result;
}

// 前置拦截（提前返回，不调用 next）
async function withMethodCheck(this: IServiceLocator, message: IncomingMessageWithParams, next: () => Promise<HandlerResult>) {
  if (message.method !== 'GET') {
    return { status: 405, content: 'method not allowed' };
  }
  return next();
}

// 业务逻辑（链的末端，不调用 next）
export default async function (this: IServiceLocator, message: IncomingMessageWithParams) {
  const userService = this.userService as IUserService;
  const user = await userService.findById(message.params.id);
  return { status: 200, content: JSON.stringify(user) };
}
```

## Handler 与路由的关系

路由在模块内确定（`declare()` 声明或按模块路径推导），框架负责匹配，匹配在 Handler 链执行之前完成。

```
入站请求 → 路由匹配（框架内部）→ Handler 链执行 → 响应出站
```

Handler 模块通过 `declare()` 声明路由和处理序列：

```typescript
// handlers/users/index.ts
import { withMethodCheck } from '../shared/withMethodCheck.js';
import { withTiming } from '../shared/withTiming.js';

export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/users/:id' },
      { method: 'POST', path: '/users' },
    ],
    // 每个模块自行决策组合哪些 Handler，框架按数组顺序构建洋葱链
    handlers: [withMethodCheck, withTiming]
  };
}

// default 导出是链的末端（业务逻辑），由框架自动追加到 handlers 数组之后
export default async function (this: IServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
  const userService = this.userService as IUserService;
  const user = await userService.findById(message.params.id);
  return { status: 200, content: JSON.stringify(user) };
}
```

框架执行逻辑：`handlers.concat(default)` 组成完整的洋葱链，每次请求通过 `.call(serviceLocator, ...)` 注入 `this`。

设计要点：
- **不要全局 Handler**：每个模块自己决策组合哪些
- **不在函数体内内联**：不方便测试、不可见
- **declare() 中声明**：链的组合关系清晰可见、可独立测试
- **前置 Handler 写成 handlers 树内的非 index 文件**：不满足入口条件的模块不注册，作为普通 ES Module 供 `import` 复用（如上方 `handlers/shared/withTiming.js`）

## Service

详见 [core-service.md](./core-service.md)。

## 错误处理

内层 Handler 抛出的错误沿链向外传播。业务承接方式：在 Handler 用 try/catch 包住自己的实现或 `await next()`，最外层 Handler 的覆盖范围最大。框架在路由层提供兜底（日志记录 + 默认 500 响应），不提供自定义全局错误处理器的注册机制；如需自定义错误响应，处理中异常只能在 handlers 最外层写 try/catch 承接，`/*` catch-all 路由只用于定制 404（路由未命中不经过任何 Handler，与 500 无关）。

```typescript
async function withErrorHandler(
  this: IServiceLocator,
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
    handlers: [withErrorHandler, withAuth]  // withErrorHandler 在最外层
  };
}
```

洋葱模型中，最外层 Handler 的 `await next()` 覆盖了所有内层 Handler 的执行，天然适合 try/catch 承接错误。

404（路由未命中）不经过 Handler 链，需通过 `/*` catch-all 路由处理，详见 [core-routing.md](./core-routing.md)。

## 已确认

- `default` 导出必须，作为 Handler 链的末端（业务逻辑），非函数记日志跳过不注册
- Handler 禁止箭头函数，保证 `this` 绑定
- 不要全局 Handler，每个模块自行决策组合
- 同一 Handler 内 `next()` 只能调用一次，重复调用抛错
- 链尾 `next()` 返回 `undefined`，204 只出自 httply 的 falsy 映射，管线不自造响应

## 搁置

- **Controller / 多操作聚合**：V4 不处理，一个 Handler 文件对应一个处理函数。CRUD 聚合需求留待后续版本。
