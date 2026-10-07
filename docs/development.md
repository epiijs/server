---
title: 开发指南
description: 环境工具、编码规范、依赖约定与验证方式
last_updated: 2026-10-06
---

# 开发指南

## 环境工具

- Node.js ≥ 24，Node 20 已 EOL
- 包管理：npm；默认 registry 慢时可用 `https://registry.npmmirror.com`
- 取外部资料：WebFetch 不可用时改用本地 `curl -sL`，优先抓文档源而非渲染页

## 编码规范

- TypeScript 保持 strict
- `types: ["node"]` 不可省：去掉后 IDE 报 `ts(2591)`，而 `tsc` 与 CI 都不报
- Node 内置模块导入必须带 `node:` 前缀：明确取内置，不受同名缓存或用户空间包干扰
- 模块级全局变量必须 `const`，不用 `let`
- 模块级函数一律 `function` 声明，不写 `const fn = () => {}`
- 注释不以标点收尾；类型与字段注释只写「是什么，默认 X」，行为规则归 `docs/core-*.md`
- `test/` 用例以纯 JS 编写，只使用公开 API

## 依赖约定

- devDependencies 用浮动版本
- 新增运行时依赖先更新设计文档
- 依赖变动后执行一次 `npm audit`，处理有结论的高危项

## 验证方式

- `npm run lint` 必须零 error，配置见 `eslint.config.mjs`（`src/` 之外一律 ignore）
- 提交前必须执行 `npm test`，用例全部通过，且语句覆盖率不低于 80%、分支覆盖率不低于 85%
- 覆盖率统计口径为 `build/` 产物，配置见 `vitest.config.ts` 的 `coverage.include`
- fixture 在 `test/fixtures/`，其下 `build/` 是路由与服务加载的样本产物，故意入库，靠 `.gitignore` 的 `/build/` 锚定才未被误忽略

## 构建发布

- 保护 ESM 构建；`moduleResolution: NodeNext` 强制编译期检查 import 要有 `.js` 后缀
- 发布清单走 `files: ["build"]` 白名单而非 `.npmignore`，范围一眼可见
