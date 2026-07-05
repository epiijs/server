# Core: 依赖注入 Service

> 状态：已批准 | 涉及版本：V4

## 概述

Service 是框架的依赖注入机制，用于管理公共服务的实例化生命周期。通过 `@epiijs/inject` 实现。

Service 在 Handler 中通过 `this` 访问（`this` 绑定为 ServiceLocator）。

## 两级作用域

| 作用域 | 生命周期 | 适用场景 |
|--------|----------|----------|
| **Process** | 服务进程生命周期 | 数据库连接、配置、缓存等长生命周期资源 |
| **Session** | 单次请求管线 | 请求相关的临时状态 |

默认作用域为 Process。

## Service 模块

Service 模块在 `services/` 目录中定义：

```typescript
// services/userService.ts
interface IUserService {
  findById: (id: string) => Promise<IUser>;
  findUsers: () => Promise<IUser[]>;
}

// default 导出为 Service 工厂函数
export default function (services: ServiceLocator): IUserService {
  const dataService = services.dataService as IDataService;

  return {
    findById: (id: string) => dataService.executeQuery(`SELECT * FROM users WHERE id = '${id}'`),
    findUsers: () => dataService.executeQuery('SELECT * FROM users'),
  };
}
```

### declare() 自定义注册

通过导出 `declare` 函数自定义服务注册选项：

```typescript
export function declare() {
  return {
    name: 'UserService',        // 自定义服务名（默认为文件名）
    scope: 'Session',           // 自定义作用域（默认 Process）
  };
}
```

## 服务查找

### 在 Service 工厂中

通过 `ServiceLocator` 参数查找依赖：

```typescript
export default function (services: ServiceLocator) {
  const dataService = services.dataService as IDataService;
  // ...
}
```

### 在 Handler 中

通过 `this`（绑定为 ServiceLocator）查找：

```typescript
export default async function (this: ServiceLocator, message: IncomingMessage) {
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

```typescript
// 在 Handler 中访问配置
export default async function (this: ServiceLocator, message: IncomingMessage) {
  const config = this.appConfig as IAppConfig;
  // ...
}
```

## DI 容器结构

```
Process Injector（进程级）
  ├─ 启动时创建，进程生命周期
  ├─ 注册 scope=Process 的服务
  ├─ 注册框架内置服务（appConfig、appLogger）
  │
  └─ Session Injector（会话级，每次请求创建）
      ├─ inherit(processInjector)    # 继承进程级服务
      ├─ 注册 scope=Session 的服务
      └─ 绑定到 Handler 链的 this
```

- 框架启动时创建 Process Injector，注册进程级服务和内置服务
- 每次请求创建 Session Injector，继承进程级，注册会话级服务
- Session Injector 的 ServiceLocator 绑定到 Handler 链的 `this`
- 请求结束后 Session Injector dispose

## Service 发现

框架启动时扫描 `services/` 目录：

1. 扫描目录下所有 `**/index.js` 文件
2. 动态 `import()` 每个模块
3. 验证 `default` 导出是否为函数（工厂函数）或值（服务实例）
4. 调用 `declare()` 获取注册选项（如存在）
5. 注册到对应作用域的 Injector
