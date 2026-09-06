# AI 非线性会话地图

一个面向 AI 长对话的浏览器插件：把 ChatGPT 中的线性问答投影成可浏览、可定位、可分支的会话地图。

当前仓库处于阶段 0 技术探针。产品源码、构建配置和依赖尚未创建；仓库只允许加入经过审查、与正式插件隔离的只读探针工具，用于验证文档中的关键假设。

## 一句话原则

原始 ChatGPT 会话是事实源；地图是可重建的投影与操作入口，不成为第二套聊天系统。

## 首版范围

- 仅支持 ChatGPT Web。
- 将一条用户 Question 与其后续 Assistant Answer 聚合为一个 Turn/Card。
- 将 Turn 投影为逻辑图，并独立保存画布布局。
- 支持地图到原聊天、原聊天到地图的双向定位。
- 支持从任意已完成 Turn 发起新分支；若平台能力不足，必须明确降级，不能伪造“真实分支”。
- 数据默认仅保存在浏览器本地。

## 计划技术栈

- 浏览器扩展：WXT、Manifest V3
- 界面：React、TypeScript、React Flow
- 本地数据：Dexie、IndexedDB
- 测试：Vitest；浏览器端端到端测试方案在开发阶段确定

技术版本将在进入脚手架阶段时核对官方文档后锁定；本阶段不创建 `package.json`。

## 文档导航

1. [产品定义](docs/01-product.md)
2. [架构与边界](docs/02-architecture.md)
3. [领域模型与数据流](docs/03-domain-model.md)
4. [ChatGPT Site Adapter 规范](docs/04-chatgpt-adapter.md)
5. [分支与双向定位](docs/05-branching-navigation.md)
6. [存储、隐私与安全](docs/06-storage-security.md)
7. [开发路线与验收](docs/07-development-plan.md)
8. [架构决策记录](docs/08-architecture-decisions.md)
9. [项目团队与协作流程](docs/09-team-workflow.md)
10. [阶段 0：ChatGPT 技术探针](docs/stage-0/README.md)
11. [T0-01 只读脱敏采集工具](docs/stage-0/t0-01-readonly-collection-kit.md)
12. [项目修改日志](CHANGELOG.md)

## 借鉴与原创边界

项目借鉴 [liangmianya/dsh-synapse](https://github.com/liangmianya/dsh-synapse) 的架构思想，尤其是“原会话为事实源”“地图是投影”“问答聚合成卡片”“布局与血缘分离”“通过原生会话能力执行分支”。本项目不会复制其实现代码、文件结构或产品界面。

## 下一阶段启动条件

以下事项确认后再生成正式插件脚手架和产品代码；阶段 0 允许使用隔离的只读探针工具收集批准范围内的证据：

- 文档中的 MVP 范围获得确认。
- “真实分支”的 ChatGPT 可用路径完成技术验证。
- 插件入口形态（侧边栏、独立扩展页或二者兼有）按本文档默认方案实施或被明确调整。
- 存储内容与隐私默认值获得确认。

## 修改记录规则

从项目创建开始，每一步实际修改都记录在 [CHANGELOG.md](CHANGELOG.md) 中。日志应说明修改目的、涉及文件、验证结果和后续事项；仅讨论但未落地的想法不记录为“已完成”。

所有项目执行者同时遵循 [AGENTS.md](AGENTS.md)：每项完成的修改必须形成可回溯 Git 提交并同步到 GitHub；未成功推送的修改不得报告为“已同步完成”。
