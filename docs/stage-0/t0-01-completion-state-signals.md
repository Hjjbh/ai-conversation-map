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
- 真实页面状态：尚未运行 `0.2.0`。
- 选择器置信度：低，等待 S1 实测。
- QSR 状态：PASS，绑定探针 SHA-256 `5B4B890B5DC384A14F3652DDADF951576A86C3BB3AE520C2A7D67CB5D966E1DB`。
- 运行授权：尚未取得；技术复核通过不自动授权真实页面运行。
