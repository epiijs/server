# Core: 路由机制

> 状态：已批准 | 涉及版本：V4

## 概述

路由是 HTTP 管线的第二步：将入站请求的 `method` + `url` 匹配到具体的 Handler 函数。

```
入站请求 → 解析 IncomingMessage → 【路由匹配】→ Handler 链执行 → 构造 OutgoingMessage → 出站响应
```

路由注册采用 **declare() 声明优先、文件系统兜底** 的策略：

```
每个 Handler 模块的路由 = declare() 存在 ? declare() 声明的路由 : 文件系统路径推导的默认 GET 路由
```

- `declare()` 声明的路由是推荐的主要方式
- 文件系统兜底路由仅在模块**未导出 declare()** 时生效
- 底层使用 find-my-way 高性能路由器

## declare() 路由声明

Handler 模块通过导出 `declare` 函数显式声明路由。这是推荐的主要路由注册方式。

### 基本用法

```typescript
import { HandlerDeclareResult, HandlerResult, IncomingMessageWithParams } from '@epiijs/server';

export function declare(): HandlerDeclareResult {
  return {
    routes: [
      { method: 'GET', path: '/users' },
      { method: 'GET', path: '/users/:id' },
      { method: 'POST', path: '/users' },
      { method: 'PUT', path: '/users/:id' },
      { method: 'DELETE', path: '/users/:id' },
    ]
  };
}

export default async function (this: ServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
  const { method, params } = message;

  switch (method) {
    case 'GET':
      if (params.id) {
        return JSON.stringify({ id: params.id, name: 'Alice' });
      }
      return JSON.stringify([{ id: 1, name: 'Alice' }]);
    case 'POST':
      // ...
  }
}
```

### declare() 返回值

```typescript
interface HandlerDeclareResult {
  routes: Array<{
    method: HTTPMethod;  // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
    path: string;        // 路由路径，支持 :param 参数
  }>;
  stacks?: HandlerFn[];    // 堆叠在 default 之上的 Handler 链
}
```

### 路由参数

路径参数支持两种写法，效果等价：

```typescript
// :param 语法（推荐）
{ method: 'GET', path: '/users/:id' }
{ method: 'GET', path: '/posts/:postId/comments/:commentId' }

// $param 语法（兼容，自动转换为 :param）
{ method: 'GET', path: '/users/$id' }
```

匹配到的参数值通过 `IncomingMessageWithParams.params` 获取：

```typescript
// GET /users/42
message.params.id  // '42'
```

## 文件系统兜底路由

当 Handler 模块未导出 `declare` 函数时，框架基于 `handlers/` 目录结构自动推导默认 GET 路由。

### 路径推导规则

- `IncomingMessage.url.pathname` 对应 handlers 目录路径下的 `index.js` 文件
- 使用 `$` 前缀目录表示路径参数
- 只查找 `index.js`，其他文件名会被忽略
- 默认自动添加 GET 方法，不可覆盖

```
handlers 目录                   → 推导的默认路由
├── index.js                    → GET /
├── health/
│   └── index.js                → GET /health
├── users/
│   └── index.js                → GET /users
└── $id/
    └── index.js                → GET /:id
```

### 典型兜底用法

```typescript
// handlers/health/index.ts
// 简单场景：不写 declare()，自动生成 GET /health
export default async function (): Promise<HandlerResult> {
  return 'ok';
}
```

## 错误处理

框架不提供全局错误处理器机制。错误处理完全由业务代码通过 `stacks` 和 catch-all 路由承接。

### Handler 链异常（stacks 最外层）

Handler 链内抛出的异常由 stacks 最外层的错误处理 Handler 承接，详见 [core-handler.md](./core-handler.md#错误处理)。

### 404 处理（`/*` catch-all 路由）

路由未命中时 Handler 链不执行，无法通过 stacks 处理。业务可注册 `/*` catch-all 路由来自定义 404 响应：

```typescript
// handlers/_notfound/index.ts
export function declare(): HandlerDeclareResult {
  return {
    routes: [{ method: 'GET', path: '/*' }]
  };
}

export default async function (this: ServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
  return { status: 404, content: renderNotFoundPage(message.url) };
}
```

find-my-way 路由优先级为 `static > parametric > wildcard`，`/*` 仅在所有更精确的路由都不匹配时命中，不影响正常路由。

### 框架兜底

框架在路由层提供两个最简兜底：
- 路由未命中（find-my-way 返回 null）→ 默认 404 响应
- Handler 链抛出异常且未被 stacks 捕获 → 日志记录 + 默认 500 响应

这是框架的最低保障，如需自定义错误响应，应通过 stacks 错误处理 Handler 或 `/*` catch-all 路由实现。

## Handler 发现机制

服务启动时，框架自动扫描 handlers 目录发现 Handler 模块：

1. 扫描 `handlers/`（编译后为 `build/handlers/`）下所有 `**/index.js` 文件
2. 动态 `import()` 每个模块
3. 验证 `default` 导出是否为函数
4. 调用 `declare()` 获取路由声明（如存在）
5. 将路由注册到 find-my-way 路由器

模块的 `default` 导出必须是 Handler 函数，否则打印错误并跳过该模块。

## 底层路由器

使用 [find-my-way](https://github.com/delvedor/find-my-way) 作为底层路由器，初始化配置：

```typescript
createFindMyWayRouter({
  ignoreTrailingSlash: true  // /users 和 /users/ 等价
});
```

find-my-way 提供基于 radix tree 的高性能路由匹配，支持：
- 精确路径匹配：`/users`
- 参数匹配：`/users/:id`
- 通配符匹配：`/files/*`
- 忽略尾部斜杠
