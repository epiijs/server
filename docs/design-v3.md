# @epiijs/server 项目概览

HTTP 微服务简单框架，面向 ES Module，适合微服务云上部署和水平伸缩。

## 设计哲学

- 摈弃 MVC 复杂理念，极力精简路由机制，引入依赖注入机制
- 业务实现方式单一、复杂度有上限
- 引导开发者专注于业务，而不是分心在琐碎的底层技术细节

版本演进：V1（初始）→ V2（摈弃 MVC，引入 DI）→ V3（全面 ESM，当前）→ V4（计划重新支持 controller 类）

## 核心概念

四个核心概念：**Context（上下文）**、**Action（操作）**、**Handler（处理器）**、**Service（服务）**。

| 概念 | 来源 | 含义 |
|------|------|------|
| Context | 自创 | 每个入站请求生成，响应时销毁，注入管线副作用 |
| Action | ASP.net | 请求必须对应操作，略去 Controller |
| Handler | Fastify | 管线拦截能力，处理器-in-action |
| Service | ASP.net | 注入的依赖是服务 |

## HTTP 管线

```
入站请求 → 解析 IncomingMessage → 路由到 Action → 调用 Action 获得响应数据 → 构造 OutgoingMessage → 出站响应
```

1. 解析 HTTP 入站请求为 `IncomingMessage`
2. 根据 `url` + `method` 路由到具体 Action 函数
3. 调用 Action 函数，获得可响应数据
4. 构造为 `OutgoingMessage`，输出 HTTP 出站响应

## Action 函数

Action 函数不能直接操作原始 request 和 response。返回方式：

- 简单返回（字符串等）→ 默认 200
- 返回 `OutgoingMessage` 对象 → 自定义状态码、headers
- 非空数据 = 200，空数据 = 204
- 抛出错误 → 兜底 500

## 路由机制

### declare() 路由声明（推荐）

Action 模块通过导出 `declare` 函数显式声明路由，这是推荐的主要路由注册方式：

```typescript
import { ActionDeclareResult } from '@epiijs/server';

export function declare(): ActionDeclareResult {
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
```

路由参数支持 `:param` 语法，也兼容 `$param` 写法（自动转换为 `:param`）。

### 文件系统兜底路由

当 Action 模块未导出 `declare` 函数时，框架基于 `src/server/actions` 目录结构自动推导默认 GET 路由作为兜底：

- `actions/users/index.js` → `GET /users`
- `actions/$id/index.js` → `GET /:id`

最终路由 = declare() 声明的路由 ++ 文件系统推导的默认 GET 路由（始终追加，不可覆盖）。

### 全局错误处理

任意 Action 通过 `declare` 标记 `global: 'error'`，捕获管线错误并自定义响应。

## 管线上下文 Context

通过 `context.install` 挂载副作用，开发者通过 `context.useXxx()` 访问。

安全访问边界：分离 message 和 context，防止三方开发者逆向访问其他副作用。

## 管线注入 Handler

`context.useHandler(handler)` 注入管线处理器：

- handler 函数立即执行
- dispose 函数延迟到 action 返回后执行
- handler 返回非空值触发提前响应（通过 BreakActionError Rejection 中断）

## 依赖注入 Service

通过 `@epiijs/inject` 实现，服务在 `src/server/services` 目录描述。

两级作用域：
- **进程级（Process）** — 服务进程生命周期有效，默认
- **会话级（Session）** — 单次请求管线有效

消费方式：
- Service 工厂函数中通过 `ServiceLocator` 查找依赖
- Action 函数中通过 `context.useService(name)` 查找依赖

## 关键依赖

| 包 | 用途 |
|----|------|
| `@epiijs/config` | 配置验证 |
| `@epiijs/httply` | HTTP 消息抽象（IncomingMessage/OutgoingMessage） |
| `@epiijs/inject` | 依赖注入容器 |
| `find-my-way` | 高性能 URL 路由器 |
| `glob` | 文件系统模块发现 |
| `mime-types` | MIME 类型检测 |
