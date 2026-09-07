# T0-01 回答完成状态候选信号

## 1. 问题与证据边界

S1 的三次 `0.1.0` 观察均能稳定识别消息结构，但 9/9 条 Assistant 记录的状态都是 `unconfirmed`。仅凭 `aria-busy` 不为 `true` 或页面没有流式信号，不能证明回答已经完成。

[OpenAI 官方 ChatGPT 文档](https://learn.chatgpt.com/docs/visualizations)在故障排查中区分“等待响应完成”和之后继续操作的产品阶段，但没有公开 ChatGPT Web 的 DOM、选择器或消息完成状态契约。因此，本文件中的所有 DOM 信号都是待实测候选，不是官方接口保证。

## 2. `0.2.0` 判定规则

`0.2.0` 增加只读的 `stateEvidence`，只输出固定类别，不输出任何属性原值。

| 输入证据 | `answerStateHint` | 含义 |
|---|---|---|
| Assistant 容器自身、角色节点或后代存在 `aria-busy="true"`，且无完成正向信号 | `streaming-signal` | 存在生成中候选证据 |
| Assistant Turn 内存在复制操作候选，且无 `aria-busy="true"` | `completed-signal` | 存在回答完成正向候选证据 |
| 流式与完成候选同时存在 | `conflicting-signals` | 信号冲突，禁止判定完成 |
| 只有反馈操作、无复制操作，或没有任何候选 | `unconfirmed` | 证据不足，保持降级 |
| 用户消息 | `unconfirmed` | 不对 Question 应用回答状态 |

`completed-signal` 是候选状态名，不等价于已建立稳定平台契约。只有经过 S1/S2/S3 多场景验证后，Projection Engine 才能把它映射为领域层 `complete`。

## 3. 候选选择器

当前只读取以下精确、无正文的 `data-testid` 候选：

| 固定输出类别 | 候选选择器 | 判定用途 |
|---|---|---|
| `copy-action` | `[data-testid="copy-turn-action-button"]` | 唯一完成正向候选 |
| `positive-feedback-action` | `[data-testid="good-response-turn-action-button"]` | 仅诊断，不单独判定完成 |
| `negative-feedback-action` | `[data-testid="bad-response-turn-action-button"]` | 仅诊断，不单独判定完成 |

工具不会输出实际 `data-testid`、`aria-label`、按钮文本或其他属性值，也不会点击这些控件。候选选择器未命中时不会启用文本匹配或宽泛 class 回退。

## 4. 输出变化

- 报告 `schemaVersion` 从 `1` 升为 `2`。
- 每条消息增加 `stateEvidence.ariaBusyTrue` 和 `stateEvidence.completionActionKinds`。
- `summary` 增加 `completedSignalCount` 和 `conflictingSignalCount`。
- `streamingSignalCount` 统计所有 `ariaBusyTrue`，包括与完成候选冲突的记录。
- 浏览器公开 API 仍只有 `version`、`run()`、`dispose()`。

旧的 schema 1 观察保持原样，不进行追溯改写。

## 5. 安全降级与验收

1. 流式和完成信号冲突时必须输出 `conflicting-signals`，不能选择性忽略任一证据。
2. 反馈操作不能单独证明完成；缺少复制操作时保持 `unconfirmed`。
3. 选择器变化、控件延迟渲染或账户差异导致未命中时保持 `unconfirmed`。
4. 任何候选都不能触发点击、焦点、滚动、网络、持久化或剪贴板操作。
5. 首次真实页面运行前，工具源码、测试、输出 schema 和哈希必须通过 QSR 独立复核。
6. S1 已完成页面的三个 Assistant Turn 应全部出现一致的正向候选，才能关闭当前 S1 状态缺口。
7. S3 仍需单独验证流式、完成、中断和错误场景；S1 结果不能代替 S3。

## 6. 当前状态

- 实现状态：`0.2.0` 已编码并通过本地合成测试。
- 真实页面状态：已完成一次获批的 S1 只读回测；3/3 Assistant 命中 `completed-signal`，流式与冲突计数均为 0。
- 选择器置信度：低；当前仅证明候选适用于这一份 S1 已完成页面状态。
- QSR 状态：PASS，绑定探针 SHA-256 `5B4B890B5DC384A14F3652DDADF951576A86C3BB3AE520C2A7D67CB5D966E1DB`。
- 运行授权：PO/用户已于 2026-09-06 明确批准首次 S1 只读回测。

首次回测证据为 `T0-01-S1-V02-R01`。该次结果满足本文件第 5.6 条的单次 S1 预期，但在重复读取、S2/S3 和不同页面版本验证完成前，不把候选升级为稳定平台契约，也不自动映射为领域层 `complete`。

重复性验证曾形成 [D0-06 授权包](t0-01-s1-v02-repeat-authorization.md) 并获 PO 批准，但操作人在 R02 运行前报告页面已经刷新，触发静态页面熔断条件，R02/R03 均未执行。当前 [D0-07 授权包](t0-01-s1-post-refresh-authorization.md) 已获 PO 批准，可执行一次刷新后前瞻性只读观察；页面再次变化即失效。

## 7. 首次运行授权范围

- 目标：原 S1 专用、非敏感、可丢弃的合成 ChatGPT 会话。
- 工具：仅限 SHA-256 为 `5B4B890B5DC384A14F3652DDADF951576A86C3BB3AE520C2A7D67CB5D966E1DB` 的 `0.2.0`。
- 次数：已执行并用尽一次只读回测授权；任何后续重复读取需重新明确授权。
- 允许：人工加载工具、调用 `run()`、人工预览脱敏结果、转交脱敏 JSON、调用 `dispose()`。
- 禁止：发送、编辑、停止、重试、重新生成、分支、点击响应控件、读取网络或持久化原始页面数据。
- 排除：S2、S3、私人会话、业务会话和历史真实会话不在本次授权内。
