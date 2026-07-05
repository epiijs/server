# AGENTS.md

## 工作流程

1. **设计方案** — 收集需求和约束，在项目的 `docs/` 目录下创建或更新设计文档，人工审查确认后再进入开发。
2. **开发实现** — 根据确认后的方案实现，遵循最小变更、最简实现原则，避免过度设计。
3. **验证测试** — 执行 Lint 和必要的单元测试，确保变更准确反映需求。若超过 3 次尝试仍未解决，立即中断并请求人工协助。
4. **更新文档** — 根据实际实现精简文档描述，清理前后矛盾之处，保持文档与代码一致。

## 文档目录

文档指引：
1. 需求和待办跟踪在 `docs/todo-list.md`
2. 每次需求的设计与实现前，必须阅读相关 `core-*.md` 文档，可选阅读其他设计文档，确保设计与实现有据可依。
3. Agent 辅助工具，参考 `docs/agent-toolkit.md`

```
docs/
├── todo-list.md      # 任务清单（必须）
├── design-v3.md      # V3 设计文档（历史参考）
├── design-v4.md      # V4 设计文档（当前版本）
├── core-*.md         # 核心文档（各模块设计与规范）
└── agent-toolkit.md  # 项目特有的 Agent 技巧或工具（可选）
```

## 开发指引

- 包管理：`npm install`
- 构建：`npm run build`（clean → eslint → tsc）
- 测试：`npm test`（build → c8 + mocha）
- 清理：`npm run clean`（移除 build 和 coverage）
- 最低 Node.js 版本：20.0.0
- 模块系统：ES Module（`"type": "module"`）
- TypeScript 编译目标：ES2020，输出到 `build/`
