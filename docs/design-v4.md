# @epiijs/server V4 设计

> 状态：已实施 | 基于 V4 spec 文档和实际实现

## 设计哲学

V4 是一个回归本质的版本。承认 Koa-like 模型是表达请求-响应流程的最简模型，放弃 V3 中的过度创新，用更少的概念实现同样的能力。

核心原则：
- **概念最少化** — 能合并的概念就合并，能去掉的概念就去掉
- **数据流清晰** — 输入是参数，输出是返回值，没有隐式变异
- **显式优于隐式** — 路由声明、Handler 链组合都可见可测试

## 概念模型

V4 只有两个核心概念：

| 概念 | 职责 |
|------|------|
| **Handler** | 管线处理函数，Koa 风格洋葱链 |
| **Service** | 依赖注入，管理实例化生命周期 |

路由是框架内部机制，开发者不参与。Context 概念已移除。

## 管线

```
入站请求
  → 解析 IncomingMessage（不可变）
  → 路由匹配（框架内部，find-my-way）
  → Handler 洋葱链执行（this = ServiceLocator）
  → 获得 HandlerResult（不可变）
  → 构造 OutgoingMessage
  → 出站响应
```

## Handler

Handler 是管线的唯一处理单元。每个 Handler 函数接收不可变的输入，产生不可变的输出，通过 `next()` 控制流串联。

```typescript
// IncomingMessageWithParams 继承 httply 的 IncomingMessage，在 server 层扩展路由参数
class IncomingMessageWithParams extends IncomingMessage {
  readonly params: Record<string, string>;
  constructor(raw: http.IncomingMessage, params: Record<string, string>) {
    super(raw);
    this.params = params;
  }
}

type HandlerFn = (
  this: ServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
) => Promise<HandlerResult>;
```

四个要素，各司其职：

| 要素 | 角色 | 可变性 | 来源 |
|------|------|--------|------|
| **`this`** | 能力（ServiceLocator） | 不可变 | 每次请求通过 `.call()` 注入 |
| **`message`** | 输入（IncomingMessageWithParams） | 不可变 | 每次请求生成 |
| **`next`** | 控制流 | — | 框架组合链时注入 |
| **返回值** | 输出（HandlerResult） | 不可变 | Handler 产生 |

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

- 调用 `next()` — 控制权交给下一个 Handler
- 不调用 `next()` — 提前返回，后续 Handler 不执行
- `await next()` 之后 — 后置逻辑（替代 V3 的 dispose）

### Handler 链组合

框架通过 `composeHandlers` 将 stacks 和 default 组合为洋葱链：

```typescript
function composeHandlers(
  stacks: HandlerFn[],
  defaultHandler: HandlerFn
): (message: IncomingMessageWithParams, serviceLocator: ServiceLocator) => Promise<HandlerResult> {
  const chain = stacks.concat(defaultHandler);
  return async (message, serviceLocator) => {
    // dispatch 递归调用，chain[i].call(serviceLocator, ...) 绑定 this
    // 错误由调用方（路由层）处理
  };
}
```

**绑定时机**：`serviceLocator` 在每次请求时传入，通过 `.call()` 绑定到 Handler 的 `this`。这样 per-request 的 Session Injector 可以正确注入。

### 约束

Handler 函数**禁止使用箭头函数**，以保证 `this` 绑定正常工作。

详见 [core-handler.md](./core-handler.md)。

## 路由

路由采用 **declare() 声明优先、文件系统兜底** 的策略：

```
每个 Handler 模块的路由 = declare() 存在 ? declare() 声明的路由 : 文件系统路径推导的默认 GET 路由
```

- `declare()` 声明的路由是推荐的主要方式
- 文件系统兜底路由仅在模块**未导出 declare()** 时生效
- 底层使用 find-my-way 高性能路由器

### declare() 路由声明（推荐）

```typescript
// handlers/users/index.ts
export function declare(): HandlerDeclareResult {
  return {
    routes: [
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/users/:id' },
      { method: 'POST', path: '/users' },
    ],
    stacks: [withAuth, withTiming]  // 堆叠在 default 之上的 Handler 链
  };
}

export default async function (this: ServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
  // 业务逻辑 — 链的末端
}
```

框架执行逻辑：`[...stacks, default]` 组成完整洋葱链。

### 文件系统兜底

无 `declare()` 时，框架基于 `handlers/` 目录结构自动推导默认 GET 路由。

详见 [core-routing.md](./core-routing.md)。

## Service

两级作用域的依赖注入，通过 `@epiijs/inject` 实现。

| 作用域 | 生命周期 | 适用场景 |
|--------|----------|----------|
| **Process** | 进程生命周期 | 数据库连接、配置、缓存 |
| **Session** | 单次请求 | 请求相关临时状态 |

### 访问方式

Handler 中通过 `this` 访问（`this` 绑定为 ServiceLocator）：

```typescript
export default async function (this: ServiceLocator, message: IncomingMessageWithParams) {
  const config = this.appConfig as IAppConfig;     // 内置进程级 Service
  const userService = this.userService as IUserService;
  // ...
}
```

Service 工厂中通过参数访问：

```typescript
export default function (services: ServiceLocator): IUserService {
  const dataService = services.dataService as IDataService;
  // ...
}
```

### 框架内置 Service

| 服务名 | 类型 | 说明 |
|--------|------|------|
| `appConfig` | `IAppConfig` | 应用配置 |
| `appLogger` | `ILogger` | 日志器 |

启动时注册：`processInjector.provide('appConfig', verifiedConfig)`

详见 [core-service.md](./core-service.md)。

## 错误处理

路由层提供两级兜底：
- 路由未命中 → 默认 404 响应
- Handler 链未捕获异常 → 日志记录 + 默认 500 响应

如需定制错误响应，应通过以下方式自行实现：
- **Handler 链异常** — 在 stacks 最外层写 try/catch 承接
- **404 自定义** — 通过 `/*` catch-all 路由实现
- **500 自定义** — 通过 `/*` catch-all 路由 + 错误判断逻辑实现

## Context 移除

V3 的 Context 在 V4 中移除。

迁移对照：

| V3 | V4 |
|----|----|
| `context.useHandler(handler)` | Handler 链 + `next()` |
| `context.useService('name')` | `this[name]` |
| `context.getAppConfig()` | `this.appConfig` |
| `(message, context)` 双参数 | `(this: SL, message, next)` |

## 命名变更

| V3 | V4 | 理由 |
|----|----|------|
| `ActionResult` | `HandlerResult` | 不再强调 Action 概念 |
| `ActionFn` | `HandlerFn` | 统一为 Handler |
| `ActionDeclareResult` | `HandlerDeclareResult` | 同上 |
| `actions/` 目录 | `handlers/` 目录 | 不再有 Action 模块 |
| `Context` | 移除 | 不需要包裹层 |

## 实现文件

| 文件 | 职责 |
|------|------|
| `src/server/handler.ts` | IncomingMessageWithParams、HandlerFn、composeHandlers |
| `src/server/routing.ts` | HandlerDeclareResult、find-my-way 集成、handler 发现 |
| `src/server/service.ts` | mountService、两级 DI 容器 |
| `src/server/startup.ts` | startServer、请求生命周期管理 |
| `src/server/require.ts` | 模块发现（glob + dynamic import） |
| `src/server/logging.ts` | 日志器（ILogger + Proxy + setTransport） |
| `src/handlers/` | 内置 Handler（staticFiles） |

## 搁置

- **Controller / 多操作聚合** — V4 不处理，一个 Handler 文件对应一个处理函数
- **stacks import 膨胀** — 每个 Handler 显式 import stacks 函数可能导致大量重复 import。Service 的 `declare.name` 字符串查找是一种解法，但希望有比字符串更类型安全的方式。待后续设计。
