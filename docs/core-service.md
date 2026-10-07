---
title: 依赖注入 Service
description: 两级作用域、Service 模块与发现机制的现行实现文档（V4，状态：已批准）
last_updated: 2026-10-07
---

# Core: 依赖注入 Service

> 状态：已批准 | 涉及版本：V4

## 概述

Service 是框架的依赖注入机制：服务由业务模块提供，注册成什么名字、什么作用域由模块的 `declare()` 与文件位置决定，实例的构造、复用与销毁由框架负责。通过 `@epiijs/inject` 实现。

Service 在 Handler 中通过 `this` 访问（`this` 绑定为 IServiceLocator）。

## 两级作用域

| 作用域 | 生命周期 | 适用场景 |
|--------|----------|----------|
| **Process** | 服务进程生命周期 | 数据库连接、配置、缓存等长生命周期资源 |
| **Session** | 单次请求管线 | 请求相关的临时状态 |

默认作用域为 Process。

## DI 容器结构

```
进程级依赖容器（注册 Process 服务与内置服务）
  └─ 会话级依赖容器（每次请求创建，继承进程级，注册 Session 服务，作为 Handler 的 this）
```

- 框架启动时创建进程级依赖容器，注册进程级服务和内置服务
- 每次请求创建会话级依赖容器，继承进程级，注册会话级服务
- 会话级依赖容器的 IServiceLocator 绑定到 Handler 链的 `this`
- 请求结束后 dispose 会话级依赖容器，进程关闭时 dispose 进程级依赖容器

## Service 模块

Service 模块在 `services/` 目录中定义，目录形态，入口是 `index.ts`：

```typescript
// services/user/index.ts
interface IUserService {
  findById: (id: string) => Promise<IUser>;
  findUsers: () => Promise<IUser[]>;
}

// default 导出为 Service 工厂函数
export default function (services: IServiceLocator): IUserService {
  const dataService = services.dataService as IDataService;

  return {
    findById: (id: string) => dataService.executeQuery(`SELECT * FROM users WHERE id = '${id}'`),
    findUsers: () => dataService.executeQuery('SELECT * FROM users'),
  };
}
```

`default` 导出可以是工厂函数（入参 IServiceLocator，返回值即实例），也可以是服务实例值，框架统一按工厂处理。

### declare() 自定义注册

通过导出 `declare` 函数自定义服务注册项：

```typescript
export function declare() {
  return {
    name: 'UserService',        // 自定义服务名（默认取模块相对 services/ 的路径）
    scope: 'Session',           // 自定义作用域（默认 Process）
  };
}
```

`declare()` 未给出的字段用默认值。

## 服务查找

### 在 Service 工厂中

通过 `IServiceLocator` 参数查找依赖：

```typescript
export default function (services: IServiceLocator) {
  const dataService = services.dataService as IDataService;
  // ...
}
```

### 在 Handler 中

通过 `this`（绑定为 IServiceLocator）查找：

```typescript
export default async function (this: IServiceLocator, message: IncomingMessage) {
  const userService = this.userService as IUserService;
  // ...
}
```

## 框架内置 Service

框架在启动时将以下预置服务注册为进程级 Service：

| 服务名 | 类型 | 说明 |
|--------|------|------|
| `appConfig` | `IAppConfig` | 应用配置 |
| `appLogger` | `ILogger` | 日志器 |

`appConfig`、`appLogger` 是内置保留名，业务服务模块命中同名时不注册，内置不可被业务覆盖。

```typescript
// 在 Handler 中访问配置
export default async function (this: IServiceLocator, message: IncomingMessage) {
  const config = this.appConfig as IAppConfig;
  // ...
}
```

## Service 发现

框架启动时扫描 `{appRoot}/{appDirs.target}/services/` 下的 `**/*.js` 与 `**/*.mjs`，按顺序命中第一条即注册为服务：

1. 导出 `declare()`：注册项取自其返回的 `{ name, scope }`
2. 文件名为 `index.js` 或 `index.mjs`：服务名取模块相对 `services/` 的路径（去掉 `index.js`），作用域为 Process

两条都不满足的模块不注册，作为普通 ES Module 供 `import` 复用。注册到对应作用域的依赖容器。

## 错误处理

服务实例惰性构造，第一次 `this.<name>` 才执行服务的工厂函数，异常就近抛出，框架不预校验服务名是否注册。

- 访问未注册的服务名，容器抛 `service "<name>" not found`，异常沿管线冒泡，由路由兜底记日志并回 500。
- 服务工厂相互依赖成环时容器抛 `circular dependency on "<name>"`；工厂求值失败不落缓存实例，同一服务名可重试。
- 服务实例的 `dispose()` 或 `Symbol.dispose` 由容器销毁时以实例为接收者调用，Session 随请求结束、Process 随进程关闭。释放函数抛出的异常会被忽略，销毁未注册的服务名不产生操作。

## 已确认

- 入口条件两条件按序命中其一：`declare()` 优先，index 文件名兜底
- 内置保留名 `appConfig`、`appLogger` 不可被业务覆盖
- 服务实例惰性构造，dispose 异常忽略
- 未注册服务名的访问由容器抛错，框架不代答 `undefined`
