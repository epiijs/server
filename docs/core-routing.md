---
title: 路由机制
description: declare() 声明与文件系统兜底路由的现行实现文档（V4，状态：已批准）
last_updated: 2026-10-07
---

# Core: 路由机制

> 状态：已批准 | 涉及版本：V4

## 概述

路由是 HTTP 管线的第二步：将入站请求的 `method` + `url` 匹配到具体的 Handler 函数。路由在模块内确定，框架负责匹配。

```
入站请求 → 解析 IncomingMessage → 【路由匹配】→ Handler 链执行 → 构造 OutgoingMessage → 出站响应
```

模块位于概念目录 `handlers/` 下，按顺序命中第一条即注册为路由入口：

1. 导出 `declare()`：路由取自 `declare().routes`，一次可声明多条 `method` + `path`
2. 文件名为 `index.js` 或 `index.mjs`：路由按模块相对 `handlers/` 的路径推导，方法固定 GET

两条都不满足的模块不注册，作为普通 ES Module 供 `import` 复用，可复用的前置 Handler 因此写成非 index 文件。

- `declare()` 声明是推荐的主要方式，非 GET 的路由必须写 `declare()`（文件路径推不出方法）。
- 文件系统兜底路由仅在模块**未导出 declare()** 时生效。
- 底层使用 find-my-way 高性能路由器。

## declare() 路由声明

Handler 模块通过导出 `declare` 函数显式声明路由。

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

export default async function (this: IServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
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
    method: HttpMethod;  // 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'
    path: string;        // 路由路径，支持 :param 参数
  }>;
  handlers?: HandlerFn[];  // 排在 default 之前的处理序列，默认空数组
}
```

`declare()` 未给出的字段用默认值。`handlers` 的数组顺序即管线顺序（外 → 内），数组本身不含 `default`，框架执行逻辑 `handlers.concat(default)`，详见 [core-handler.md](./core-handler.md)。

### 路由参数

路径参数支持两种写法，效果等价：

```typescript
// :param 语法（推荐）
{ method: 'GET', path: '/users/:id' }
{ method: 'GET', path: '/posts/:postId/comments/:commentId' }

// $param 语法（兼容，自动转换为 :param）
{ method: 'GET', path: '/users/$id' }
```

匹配到的参数值在路由匹配阶段注入 `IncomingMessageWithParams.params`：

```typescript
// GET /users/42
message.params.id  // '42'
```

## 文件系统兜底路由

当 Handler 模块未导出 `declare` 函数时，框架基于 `handlers/` 目录结构自动推导默认 GET 路由。

### 路径推导规则

- `IncomingMessage.url.pathname` 对应 handlers 目录路径下的 `index.js` 文件
- 使用 `$` 前缀目录表示路径参数
- 未写 `declare()` 时只查找 `index.js` / `index.mjs`，其他文件名不注册
- 默认自动添加 GET 方法，不可覆盖，非 GET 的路由必须写 `declare()`

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

框架提供兜底行为捕获两类错误，捕获后会触发日志操作：路由未命中（404），异常未处理（500）。框架不提供自定义全局错误处理器的专用注册机制。

可以这样自定义错误响应：

- **处理中异常**：在 Handler 用 try/catch 包住自己的实现或 `await next()`，即可承接自己的或内层抛出的错误，最外层的 Handler 可捕获范围最大，详见 [core-handler.md](./core-handler.md#错误处理)。
- **路由未命中**：404 不经过任何 Handler，只能注册 `/*` catch-all 路由定制，它在更精确路由都不匹配时才命中。

```typescript
// handlers/_notfound/index.ts
export function declare(): HandlerDeclareResult {
  return {
    routes: [{ method: 'GET', path: '/*' }]
  };
}

export default async function (this: IServiceLocator, message: IncomingMessageWithParams): Promise<HandlerResult> {
  return { status: 404, content: renderNotFoundPage(message.url) };
}
```

find-my-way 路由优先级为 `static > parametric > wildcard`，`/*` 仅在所有更精确的路由都不匹配时命中，不影响正常路由。

## Handler 发现机制

服务启动时，框架扫描 `{appRoot}/{appDirs.target}/handlers/` 下的 `**/*.js` 与 `**/*.mjs`，发现 Handler 模块：

1. 动态 `import()` 每个模块
2. 模块导出 `declare()`：路由取自 `declare().routes`，处理序列取自 `declare().handlers`
3. 否则文件名为 `index.js` / `index.mjs`：按相对路径推导 GET 路由
4. 两条都不满足：不注册，作为普通模块
5. 命中入口但 `default` 非函数：记日志跳过，不注册
6. 将路由注册到 find-my-way 路由器

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

匹配结果（含路径参数）连同组合后的管线存入路由 store，请求时经 `router.find()` 取出执行。进程关闭时 dispose 路由。

## 已确认

- 入口条件两条件按序命中其一：`declare()` 优先，index 文件名兜底
- 非 index 文件导出 `declare()` 同样注册为路由
- 404 与 500 一样，框架兜底捕获后触发日志
- 路由根目录固定 `{appRoot}/{appDirs.target}`，产物内无 `server/` 一层
