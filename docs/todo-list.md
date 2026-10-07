---
title: 任务台账
description: @epiijs/server 工作台账，记终态与交付物清单
last_updated: 2026-10-08
---

# TODO List

@epiijs/server 工作台账，记终态与交付物清单（做没做、被什么卡、细节在哪）。

上游指令与具体任务直接投入以下列表；无法自行解决的问题记入「需要外部协同的工作」节，由上游主动读取收集，不写入上游日志。

## 需要外部协同的工作

> 本节是永久结构槽位：即便无待处理条目也不得删除。人工 Review 提出的问题高优插入本节顶部（标注「高优」）。

- [ ] 推翻 reference `projects/server.md` 的服务缺失契约 至上游读取：第 210 行「访问不存在的服务实例，返回 `undefined`，框架不全局感知」已被 inject 1.0.0 推翻，应改为容器抛 `service "<name>" not found` 并由路由兜底 500；本仓实现与文档已按新契约落地（等待方：上游巡检收集 + 人工 Review）（来源：inject/docs/todo-list.md 2026/10「server 侧跟进 1.0.0」）
- [ ] 投递 reference `projects/server.md` 的两处设计修订 至上游读取：「与实现的差异」九条本地已全部清账，请上游移除该节或改记「无差异」；新增决策「config 只作类型契约依赖」（server 全部 `import type`，产物无 config 运行时引用）请上游吸收（等待方：上游巡检收集 + 人工 Review）（来源：本仓 core-* 对齐与 config 1.x 接入）

## 待办

> **统计**：已完成 22 / 总计 38（计全文档全部 checkbox，已完成节计入终态条目）

### 扫描代价确认

- [ ] 入口探测会 import `handlers/` 与 `services/` 下每个 `.js` / `.mjs`（含 `shared/` 辅助模块），模块副作用在启动扫描时执行；`docs/core-routing.md` 目前未写明该代价，需补

### 内置管线注入

#### StaticFiles
- [ ] 基本的静态资源头定义和扩展方法

#### WellKnown
- [ ] 服务 Owner Challenge 响应
- [ ] .well-known 验证的临时代理
- [ ] 考虑是否将 well-known 验证作为独立固有路由实现

#### Portal
- [ ] 基于 Portal 的 HTML 生成

### 热重载 HotReload

- [ ] 开发环境热重载支持
- [ ] 安全防御：环境签名锁机制
- [ ] watch & load 新 handlers（`routing.ts:96` 留有 TODO）
- [ ] watch & load 新 services（尚未留 TODO 位）

### 代码质量

- [ ] Service 两级作用域测试：Session 服务真正被请求消费的路径尚无覆盖（现有 fixture 中 `scope: 'Session'` 的服务都被保留名滤除，`counter` 未被任何 Handler 使用）

### 文档

（无）

### ~~性能优化~~（已取消）

> **决策（2026-07-05）**：httply 更新后 Cruorin 机制不再需要。若未来有并发等效缓存需求，由业务层自行实现，server 框架不提供此机制。

### 远期（V4 之后）

- [ ] 支持 Controller 类（多操作聚合，V4 搁置）
- [ ] 支持 alias 配置与识别与编译
- [ ] 使用类优化高频对象初始化性能

## 已完成

> 简要记录，只留终态与交付物清单，不叙述过程。

### 4.0.0

- [x] Handler 与 Action 统一 → Handler 概念 + Koa-like 模型
- [x] Context 移除 → `this` = IServiceLocator，每次请求通过 `.call()` 注入
- [x] 提前响应控制流 → `next()` 替代 throw
- [x] 路由 → declare() 为主，文件系统兜底（仅无 declare() 时生效）
- [x] params → `IncomingMessageWithParams` 继承 httply IncomingMessage，构造时注入路由参数
- [x] 错误处理 → 路由层 try/catch 兜底 500（日志记录），业务由前置 Handler + `/*` catch-all 自定义
- [x] dispose → 已由 `await next()` 后代码替代
- [x] 命名变更 → Action* → Handler*，actions/ → handlers/
- [x] 内置 appConfig Service → 进程级容器 provide
- [x] Logger 机制 → `createLogger()` 单例 + Proxy ILogger + `setTransport` 独立导出 + appLogger Process 级 Service

### 4.1.0

- [x] 公开导出面补齐 → 业务写 Handler 与 Service 所需的值与类型都能从包入口取得，不必再引用内部模块。对外清单以 `README.md` 为准
- [x] 对外改名收口，不留别名 → 前置 Handler 数组字段、HTTP 方法类型、依赖容器类型三组更名完成，破坏面由 4.1.0 首发承载
- [x] 管线与错误契约定型 → 链尾越界的 `next()` 不产生响应，交由 httply 映射 204；404 先记日志再出站；访问未注册的服务名由容器抛错、冒泡至路由兜底 500；重复调用 `next()` 抛错
- [x] 模块发现规则统一 → Handler 与 Service 走同一套入口判定（`declare()` 优先，约定入口名兜底），`declare()` 给出的注册名与作用域生效，缺省时按模块位置推导；模块根目录固定，产物内不再有端目录一层
- [x] 框架只加载 ESM 产物 → 移除 CommonJS 互转分支。该分支是 V2 以 CommonJS 产出时的必需代码，V3 转 ESM 后前提已不存在
- [x] 内置服务不可被业务覆盖 → 内置服务先注册，撞名的业务服务不进入容器。撞名不给提示，见 `docs/design-v4.md`「搁置清单」
- [x] 依赖接入与职责边界 → config、httply、inject 三条运行时依赖全部升至 1.x；config 退化为纯类型契约，产物不再引用它；配置解析归业务入口，`startServer` 只消费定型好的配置；客户端提前断开不再泄漏会话容器
- [x] 静态文件 Handler 收敛 → 删除 V3 遗留的 `onDispose` 选项，临时文件清理由业务的前置 Handler 承担
- [x] 文档体系与代码对齐 → `design-v4.md` 转为上游同步副本并清账全部本地差异；`core-*.md` 按新契约改写；`README.md` 的启动示例与项目结构示例改为当前形态；新增 `docs/development.md`
- [x] 工程基线终态 → 检查与测试脚本分离且测试前置构建；类型检查配置、lint 基线、测试运行器与覆盖率阈值全部定型；`AGENTS.md` 采纳上游 harness 基线
- [x] 测试补齐 → 4 个测试文件 26 用例，配置经公开的导入入口构造；覆盖洋葱链执行序、提前返回、重复 `next()`、链尾越界、会话容器绑定、三类模块发现形态（目录入口、非 index 入口、`.mjs` 文件）、保留名劫持、未注册服务名抛错、公开面冒烟
- [x] 版本沿革决策 → 定为 4.1.0，承载上述全部变更；发布与打 tag 归人工执行
