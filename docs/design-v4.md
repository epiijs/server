---
title: 组件 Server 设计
description: epiijs server 设计，HTTP 微服务框架的管线、路由与依赖注入
last_updated: 2026-10-07
---

> 本文件与上游 `ref: projects/server.md` 保持同步（2026-09-28），本地调整共三处：交叉引用按本仓视角改写；类型名跟随 httply 1.1.0 由 `HTTPMethod` 更名为 `HttpMethod`；类型名跟随 inject 1.0.0 由 `ServiceLocator` 更名为 `IServiceLocator`。后两处上游原文待同步，其余内容以上游为权威。
> 按上游 `ref: harness/spec-docs.md` 文法风格（禁破折号、用「明确」不用「定稿」），本文对上游残留的旧措辞（决策「为什么前置 Handler 数组叫 handlers 不叫 stacks」的「定名回到类型本身」）已先行合规改写，待回灌上游。「与实现的差异」一节本地已全部清账（九条均已落地），上游原文待同步移除。
> 本文件额外承载上游指出不重复维护的两份本仓独有内容：「V3 → V4 迁移对照」与「搁置清单」（见附录）。

# 背景

`@epiijs/server` 提供 HTTP 微服务的简单框架，以下简称为 **server**。

设计哲学详见 `ref: architecture/principles.md`：引导开发者专注业务，而不是分心在琐碎的底层技术细节；业务实现方式单一，复杂度有上限。

## 版本沿革

| 版本 | 主张 |
|---|---|
| V1 | 初始版本 |
| V2 | 摈弃 MVC 复杂理念，精简路由机制，引入依赖注入；形态适合云上部署与水平伸缩 |
| V3 | 全面 ES Module 化 |
| V4 | 移除 Context 与 Action，管线转向 Koa-like 洋葱模型 |

V4 承认 Koa-like 是表达「请求-响应」流程的最简模型，放弃 V3 的自创概念。三条取舍：

+ **概念最少化**：能合并就合并，能去掉就去掉
+ **数据流清晰**：输入是参数，输出是返回值，没有隐式变异
+ **显式优于隐式**：路由与处理序列都声明可见、可独立测试

V3 及更早的管线形态见 `ref: legacies/server-v2-v3.md`。
V3 → V4 的逐条迁移对照见本文件「V3 → V4 迁移对照」节，上游不重复维护。

# 方案

## 项目信息

+ 仓库 [https://github.com/epiijs/server](https://github.com/epiijs/server)，分支 `main`，现行 v4.1.0。
+ 运行依赖 `@epiijs/httply`、`@epiijs/inject`、`@epiijs/config`、`find-my-way`、`glob`、`mime-types`；其中 `@epiijs/config` 仅作类型契约（全部 import type，产物无运行时引用，见决策「为什么 config 只作类型契约依赖」）。
+ 仅支持 ES Module，Node >= 24。
+ 本文件只定契约与决策，模块级实现见本仓 `docs/core-*.md`。

## 启动流程

```
业务入口
  → importConfig
    → 可选 verifyConfig
  → 可选 setTransport
  → startServer
    → 发现 handler 并注册路由
    → 发现 service 并注册到容器
    → 注册内置 service：appConfig / appLogger
    → 监听 appPort

每次请求
  → 创建会话级依赖容器，继承进程级依赖容器
  → 调用 handler
  → 构造 OutgoingMessage 并出站
  → dispose 会话级依赖容器

进程关闭
  → dispose 进程级依赖容器
  → dispose 路由
```

## 核心概念

V4 只有两个核心概念：

| 概念 | 职责 |
|---|---|
| **Handler** | 管线处理器。路由与它绑定：路由在模块内确定（`declare()` 声明或按模块路径推导），框架负责匹配 |
| **Service** | 可注入服务，框架管理其实例的生命周期 |

## 管线

Handler 函数接收不可变输入、产生不可变输出，通过 `next()` 控制流转：

```typescript
class IncomingMessageWithParams extends IncomingMessage {   // 继承 httply IncomingMessage
  readonly params: Record<string, string>;                  // 路由匹配阶段注入
}

type HandlerFn = (
  this: IServiceLocator,
  message: IncomingMessageWithParams,
  next: () => Promise<HandlerResult>
) => Promise<HandlerResult>;

type HandlerResult = AnyForOutgoingMessage;   // 可转化为 OutgoingMessage 的任意数据
```

| 要素 | 角色 | 来源 |
|---|---|---|
| `this` | 能力（IServiceLocator） | 框架构造，每次请求通过 `.call()` 注入 |
| `message` | 输入（IncomingMessageWithParams） | 每次请求的入站数据派生 |
| `next` | 控制流 | 框架构造，每次请求通过函数参数注入 |
| 返回值 | 输出（HandlerResult） | Handler 产生 |

流转：

框架把 `declare().handlers` 指定的与 `default` 导出的 Handler 函数合成为一个管线封装函数。

每次请求从第一个开始：
+ 如果调用 `next()`，执行权交给当前管线的下一个 Handler，通过 `next()` 获得那个 Handler 的返回值。
+ 如果没有下一个 Handler，`next()` 返回 `undefined`。
+ 如果不调用 `next()`，管线的后续 Handler 都不执行，使用当前返回值作为响应。
+ 内层（后续）Handler 抛出的错误会沿链向外（向前）传播，见「错误处理」。

```
请求入站
  → h1（前置逻辑）
    → h2（前置逻辑）
      → default（业务逻辑，不调用 next）
    ← h2（后置逻辑）
  ← h1（后置逻辑）
← 响应出站
```

`await next()` 之后的代码就是返回路径上的后置逻辑。

约定：

+ Handler 函数**禁止使用箭头函数**，否则 `this` 绑定失效。
+ 同一 Handler 内 `next()` 只能调用一次，重复调用抛错。
+ 绑定路由的 Handler 模块，必须 `default` 导出函数，作为管线的最终业务逻辑。
+ `default` 非函数的 Handler 模块记日志跳过，不注册。
+ Handler 不能直接操作原始 request / response，也无法从 `message` 取得框架能力（只能从 `this` 访问）。

### 响应构造

Handler 的返回值交给 httply 的 `OutgoingMessage.from()` 构造响应：

| 返回值 | 响应 |
|---|---|
| falsy（`undefined` / `null` / 空串） | 204 |
| 字符串 | 200，`text/plain; charset=utf-8` |
| Buffer 或可读流 | 200，`application/octet-stream` |
| 对象 | 取 `status`（默认 200）、`headers`、`content`（默认空串） |

+ 对象的 `headers` 一旦显式给出，就不再推断 `content-type`。
+ 未给出时按 `content` 推断：字符串或空走 `text/plain; charset=utf-8`，其余走 `application/octet-stream`。
+ `content` 可以是可读流，完全自定义输出过程时可以使用这种类型。

### 路由发现

模块位于概念目录 `handlers/` 下，按顺序命中第一条即注册为路由入口：

1. 导出 `declare()`：路由取自 `declare().routes`，一次可声明多条 `method` + `path`
2. 文件名为 `index.js` 或 `index.mjs`：路由按模块相对 `handlers/` 的路径推导，方法固定 GET

两条都不满足的模块不注册，作为普通 ES Module 供 `import` 复用，可复用的前置 Handler 因此写成非 index 文件（理由见决策「为什么入口由目录语义决定」）。`declare()` 未给出的字段用默认值，`handlers` 默认为空数组。

+ 路径参数 `:id` 推荐、`$id` 兼容。
+ 底层 find-my-way，`ignoreTrailingSlash: true`，优先级 `static > parametric > wildcard`。
+ `declare().handlers` 的数组顺序即管线顺序（外 → 内），数组本身不含 `default`。

```typescript
interface HandlerDeclareResult {
  routes: Array<{ method: HttpMethod; path: string }>;
  handlers?: HandlerFn[];   // 排在 default 之前的处理序列
}
```

### 错误处理

框架提供兜底行为捕获两类错误：路由未命中（404），异常未处理（500），捕获后会触发日志操作。
框架不提供自定义全局错误处理器的专用注册机制。

可以这样自定义错误响应：
+ 处理中异常：在 Handler 用 try/catch 包住自己的实现或 `await next()`，即可承接自己的或内层抛出的错误，最外层的 Handler 可捕获范围最大。
+ 路由未命中：注册 `/*` catch-all 路由定制 404，它在更精确路由都不匹配时才命中。

## 服务

### 依赖注入

服务由业务模块提供，注册成什么名字、什么作用域由模块的 `declare()` 与文件位置决定，实例的构造、复用与销毁由框架负责。

两级作用域，由 `@epiijs/inject` 实现，默认 Process：

| 作用域 | 生命周期 |
|---|---|
| Process | 服务进程 |
| Session | 单次请求管线 |

```
进程级依赖容器（注册 Process 服务与内置服务）
  └─ 会话级依赖容器（继承进程级，注册 Session 服务，作为 Handler 的 this）
```

+ 框架内置进程级服务：`appConfig`、`appLogger`。
+ Handler 中经 `this.<name>` 取依赖；Service 工厂中经入参 `IServiceLocator` 取依赖。

### 服务发现

模块位于概念目录 `services/` 下，按顺序命中第一条即注册为服务：

1. 导出 `declare()`：注册项取自其返回的 `{ name, scope }`
2. 文件名为 `index.js` 或 `index.mjs`：服务名取模块相对 `services/` 的路径（去掉 `index.js`），作用域为 Process

两条都不满足的模块不注册，作为普通 ES Module 供 `import` 复用。`declare()` 未给出的字段用默认值。

服务名匹配到内置保留名 `appConfig`、`appLogger` 时不注册，内置不可被业务覆盖。

+ `default` 导出可以是工厂函数（入参 IServiceLocator，返回值即实例），也可以是服务实例值，框架统一按工厂处理。

### 错误处理

服务实例惰性构造，第一次 `this.<name>` 才执行服务的工厂函数，如果发生异常会就近抛出。

+ 访问不存在的服务实例，返回 `undefined`，框架不全局感知这个现象。
+ 服务实例的 `dispose()` 或 `Symbol.dispose` 由容器销毁时调用，Session 随请求结束、Process 随进程关闭。释放函数抛出的异常会被忽略。

## 项目结构

推荐的 server 应用结构（`appRoot` 仅描述本应用，配置模型见 `ref: projects/config/design.md`）：

```plain
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

加载的是构建产物，根目录固定 `{appRoot}/{appDirs.target}`，产物内不再有一层 `server/`（见「为什么产物目录里没有 server 这一层」）。

## 公开 API

```typescript
interface IStartupResult { httpServer: Server; }

// config 为业务侧 importConfig（+ 可选 verifyConfig）解析出的完整配置，server 不再加载或校验
export function startServer(config: IAppConfig): Promise<IStartupResult>;

export function createLogger(): ILogger;
export function setTransport(fn: LoggerFn): void;

// 内置 Handler 工厂集合
export const handlers: { staticFiles: (options: IHandlerOptionsForStaticFiles) => HandlerFn };

export type {
  HandlerDeclareResult, HandlerFn, HandlerResult,
  ServiceDeclareResult, ServiceFactoryFn,
  ILogger, LoggerFn, IHandlerOptionsForStaticFiles
};
export type { HttpMethod, IncomingMessage, OutgoingMessage } from '@epiijs/httply';
```

+ server 只负责运行，不提供构建入口；产物由外部构建管线生成，保持目录结构整体打包（例如 ZIP）后部署。
+ 服务端口**不支持自动发现可用端口**，见「决策」。

## 内置实现

框架自带一些内置机制或最佳实践的实现。

### 内置服务：配置

+ `appConfig` 的值就是 `startServer` 收到的那份 `IAppConfig`，框架不加工、不裁字段。
+ 业务经 `this.appConfig` 读配置，不必再 import 配置模块。

### 内置服务：日志

+ `ILogger` 用 Proxy 实现。任意属性访问都返回写日志的函数，属性名作为 transport 的第一个参数。框架因此不定义日志级别集合。
+ `createLogger()` 返回进程内单例，框架内部各模块共用，注册为进程级服务 `appLogger`。
+ `setTransport(fn)` 覆盖写逻辑，可重复调用，最后一次生效。业务在入口文件显式 import。
+ 默认 transport 按方法名分流到对应 `console.*`，未匹配则回落 `console.log`。`setTransport(() => {})` 即静默。
+ 安全边界：`setTransport` 不挂在 `ILogger` 上。Handler 经 `this.appLogger` 拿到的实例无法覆盖写逻辑。

### 内置管线：静态文件

`handlers.staticFiles` 返回一个 Handler 函数，用于响应静态文件：

+ 目标文件由 `filePath` 直接给出，或由 `fileRoot` + `fileName` 拼接。拼接结果必须仍在 `fileRoot` 内，越界即拒绝，以防目录回溯。
+ `contentType` 可显式指定。否则按扩展名由 mime-types 推断，推不出时用 `application/octet-stream`。
+ 超过 1MB 走流式响应并补 `content-length`，以下整体读入内存。

# 特性

## WIP 热重载 HotReload

模块加载按 glob 扫描概念目录 `handlers/` 与 `services/`（构建产物内）下的 `**/*.js` 与 `**/*.mjs`，再动态 `import()`。开发环境的 Handler / Service 变更热加载即基于此，`routing.ts` 已留 watch 位，`service.ts` 尚未留。热重载需要配套环境签名锁做安全防御。是否提取 `@epiijs/loader` 共享模块加载库，待实现时决策。

## WIP Controller 类支持

V2 丢弃了 Controller，V4 曾计划重新支持，最终仍搁置（见本文件「搁置清单」）。当前一个 Handler 文件对应一个处理函数，CRUD 聚合需求留待 V4 之后评估。

# 决策

## 为什么不接收宽松的 IMaybeAppConfig

`IMaybeAppConfig` 是 `Partial<IAppConfig>`，接收它意味着 server 启动时要自行补全：调用 `importConfig` 做文件 IO 与 `envName` 决策，再调用 `verifyConfig` 校验。这份职责不该由 server 承担，两个原因。一是异步文件 IO 与 `envName` 决策被放进框架内部，违反显式优于隐式。二是 `validator` 是业务专属的，server 拿不到它，也不知道 `envData` 的形状，泛型化只能发生在调用方。

`IAppConfig` 同时喂给 server、client 与自定义 Service，由业务入口解析一次即可，框架侧只消费已定型的配置。

## 为什么前置 Handler 数组叫 handlers 不叫 stacks

字段装的是「排在 `default` 之前的一串 Handler」，元素类型就是 `HandlerFn`。旧名 `stacks` 有三处错位：数组元素是一个 handler 而不是一个栈；「栈」是中间件隐喻的残留，而 V4 明确不做中间件机制；它还暗示这批函数与 `default` 是两类东西，实际只是同一类型的不同位置。

`pipeline` / `chain` / `wrappers` 都引入了「链、管线、包装者」这类要额外解释的角色概念，与 V4「概念最少化、不造词」冲突。最终使用类型本身的名字：`declare().handlers`。

代价是 `handlers` 一词在公开面上暂与内置导出 `import { handlers }` 同名，读代码可能有歧义。这处冲突不靠改名解决，靠长期计划把内置管线拆到独立包消解（见台账远期）。

## 为什么入口由目录语义决定

`handlers/` 与 `services/` 共用一条认入口的规则：目录的 `index.js` 是该目录对外暴露的模块，非 index 文件只是供 `import` 复用的一般模块，框架不注册。这是 ES Module 的通行惯例，最简路由不必写样板声明，两个概念目录的入口条件也就此对齐。

`declare()` 只承担显式声明这一件事：method + path，以及处理序列。文件路径推不出方法，兜底注册固定 GET，非 GET 的路由必须写 `declare()`。代价是这类遗漏不在启动时暴露，要等线上 404。

可复用的前置 Handler 与路由模块同签名，本就是同一种函数，放进同一棵树才自洽。Koa 靠显式注册区分两者（`router.get` / `app.use`），文件在哪、叫什么都不影响；server 靠文件位置区分：`handlers/guards/index.js` 会被注册成 `GET /guards`，`handlers/guards/auth.js` 不会。这条约束依赖读者自觉，框架不兜底。

## 为什么产物目录里没有 server 这一层

0.7 时代路径要拼四段：`{root}/{dirs.target}/{dirs.server}/handlers`，端目录是配置项。1.x 确定一份配置只描述一个应用，create 也确定为前后端两个并列应用根目录。

于是 `appDirs.target` 里只会有本端产物，再套一层 `server/` 是重复的端标识。

所以：框架固化 `{appRoot}/{appDirs.target}` 下的 `handlers` 与 `services`，与 client 产物直接落 `target` 对称。端内怎么分目录由框架自己约定，不暴露给配置。

## 为什么移除 Context

V3 用 Context 承载管线副作用（`useHandler` / `useService` / `getAppConfig`），并要求 `message` 与 `context` 分离，以防三方 Handler 从 message 逆向访问框架能力。

V4 判断这层包裹是多余的：能力可由 `this`（IServiceLocator）直接承载，拦截可由洋葱链的 `next()` 直接表达，安全边界由「`setTransport` 这类写能力不挂在 `ILogger` / IServiceLocator 上」维持。移除后概念从 4 个降到 2 个。

## 为什么用显式 Handler 链而非中间件

中间件机制下，一条路由的拦截分散在两处：应用级 `app.use` 注册与路由自身。要看清一次请求经过什么，得跨文件发现注册顺序。server 只留一处：`declare().handlers` 就是这条路由的完整处理序列。

生态现状是中间件被严重滥用：大量三方「中间件」本质只做服务单例的初始化与挂载。这类需求应由依赖注入表达，而不是管线拦截器。

## 为什么不提供自定义全局错误处理器

V3 有 `global: 'error'` 标记的专用 Action，把错误响应交给一个全局处理者。V4 判断这层注册没有必要：任一 Handler 的 `await next()` 都覆盖其内层全部执行，在那里写 try/catch 就能承接错误。

另一半理由是职责归属：错误响应的格式与聚合策略由业务决定，框架不介入。

## 为什么端口不自动发现

入站流量的代理配置需要简单稳定。自动换端口会迫使代理侧引入服务发现或动态配置，把复杂度从启动阶段转移到运行阶段，得不偿失。端口冲突即启动失败。

## 为什么 Handler 的 this 绑定 IServiceLocator

依赖是能力的供给，与单次请求的输入无关，不该混进参数里。把能力放到 `this`，四个通道职责互不重叠，才换得来概念最少。

代价是禁止箭头函数。这是既定取舍，不是疏漏。

## 为什么不提供并发等效缓存

原 Cruorin 路径已随 httply 更新取消（2026-07 决策），框架不再提供该机制。并发等效请求合并的做法足够简单，未来有需求由业务层自行实现。

## 为什么 config 只作类型契约依赖

config 1.x 后，配置解析归业务入口，server 只消费定型好的 `IAppConfig`，用到的字段（`appRoot`、`appDirs.target`、`appPort`、`envData`）全部是类型位。因此源码统一 `import type`，编译产物不含对 `@epiijs/config` 的运行时引用，依赖收窄为零 IO、零调用。

保留依赖而不是在 server 内自定义同形结构体，是「单一权威」的取舍：`IAppConfig` 的语义权威在 config 仓，字段演进时 server 的 `.d.ts` 自动跟随，不会出现两版定义沉默分叉。依赖留在 `dependencies`（而非 devDep + peerDep 组合），让消费方类型检查开箱可用，代价只是一条不会进入运行时的安装记录。

# 演进路线

## 与实现的差异

（无。历史差异均已落地：字段更名、越界 `next()`、404 日志、保留名、模块入口、公开类型、日志文档状态、Service 示例形态、config 1.x 接入。）

# 附录：本地内容

以下两节为本仓独有内容，上游 `ref: projects/server.md` 明确指出不重复维护。

## V3 → V4 迁移对照

### Context 移除

V3 的 Context 在 V4 中移除。迁移对照：

| V3 | V4 |
|----|----|
| `context.useHandler(handler)` | Handler 链 + `next()` |
| `context.useService('name')` | `this[name]` |
| `context.getAppConfig()` | `this.appConfig` |
| `(message, context)` 双参数 | `(this: SL, message, next)` |

### 命名变更

| V3 | V4 | 理由 |
|----|----|------|
| `ActionResult` | `HandlerResult` | 不再强调 Action 概念 |
| `ActionFn` | `HandlerFn` | 统一为 Handler |
| `ActionDeclareResult` | `HandlerDeclareResult` | 同上 |
| `actions/` 目录 | `handlers/` 目录 | 不再有 Action 模块 |
| `Context` | 移除 | 不需要包裹层 |

## 搁置清单

- **Controller / 多操作聚合**：V4 不处理，一个 Handler 文件对应一个处理函数
- **stacks import 膨胀**：每个 Handler 显式 import stacks 函数可能导致大量重复 import。Service 的 `declare.name` 字符串查找是一种解法，但希望有比字符串更类型安全的方式。待后续设计。
- **非 index 模块的注册名不剥扩展名**：`declare()` 缺 `name` 时，兜底名保留 `clock.mjs` 这类文件名原样。类型上 `ServiceDeclareResult.name` 必填，TS 侧编译期已拦住，JS 侧归开发者自觉，框架不加剥扩展名或 warn 的兜底（2026-10-08 人工判定）
- **内置保留名撞名不加 warn**：命中 `appConfig` / `appLogger` 的业务服务在注册前被静默滤除，不给提示。内置不可覆盖已由「内置先 provide + 命中内置名即滤除」两重保证，撞名归业务自查（2026-10-08 人工判定）
