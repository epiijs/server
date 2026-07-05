# 待办清单

## V4 实施 — 已完成

V4 核心改造已全部完成，详见 [design-v4.md](./design-v4.md)。

- [x] Handler 与 Action 统一 → Handler 概念 + Koa-like 模型
- [x] Context 移除 → `this` = ServiceLocator，每次请求通过 `.call()` 注入
- [x] 提前响应控制流 → `next()` 替代 throw
- [x] 路由 → declare() 为主，文件系统兜底（仅无 declare() 时生效）
- [x] params → `IncomingMessageWithParams` 继承 httply IncomingMessage，构造时注入路由参数
- [x] 错误处理 → 路由层 try/catch 兜底 500（日志记录），业务通过 stacks 最外层 + `/*` catch-all 自定义
- [x] dispose → 已由 `await next()` 后代码替代
- [x] 命名变更 → Action* → Handler*，actions/ → handlers/
- [x] 内置 appConfig Service → processInjector.provide('appConfig', verifiedConfig)
- [x] Logger 机制 → `createLogger()` 单例 + Proxy ILogger + `setTransport` 独立导出 + appLogger Process 级 Service

## 内置管线注入

### StaticFiles
- [ ] 基本的静态资源头定义和扩展方法
- 当前状态：`handlerForStaticFiles.ts` 已适配 V4 HandlerFn 签名 + try/finally，基础功能可用

### WellKnown
- [ ] 服务 Owner Challenge 响应
- [ ] .well-known 验证的临时代理
- [ ] 考虑是否将 well-known 验证作为独立固有路由实现

### Portal
- [ ] 基于 Portal 的 HTML 生成

## 自定义 Service 注册

- [ ] 允许开发者通过 `declare` 函数自定义服务注册选项（名称、作用域等）
- 当前状态：`ServiceDeclareFn` 类型已定义，`declare` 结果未完整使用

## ~~性能优化~~

### ~~并发等效缓存（Cruorin）~~ — 已取消

> **决策（2026-07-05）**：httply 更新后 Cruorin 机制不再需要。若未来有并发等效缓存需求，由业务层自行实现，server 框架不提供此机制。

## 热重载 HotReload

- [ ] 开发环境热重载支持
- [ ] 安全防御：环境签名锁机制
- [ ] watch & load 新 handlers（`routing.ts` 中标注 TODO）
- [ ] watch & load 新 services（`service.ts` 中标注 TODO）

## 代码质量

- [ ] 补充更多测试用例（当前 6 个基础测试）
- [ ] `this` 绑定 ServiceLocator 测试
- [ ] Service 两级作用域测试

## 文档

- [ ] 完善 README 中 WIP 章节（error handling via stacks、declare handler and service）

## 搁置

- **Controller / 多操作聚合** — V4 不处理，一个 Handler 文件对应一个处理函数
- **stacks import 膨胀** — 每个 Handler 显式 import stacks 函数导致重复 import。Service 用 `declare.name` 字符串查找解决类似问题，但希望有更类型安全的方式。待后续设计。

## 远期（V4 之后）

- [ ] 支持 Controller 类（多操作聚合，V4 搁置）
- [ ] 支持 alias 配置与识别与编译
- [ ] 使用类优化高频对象初始化性能
