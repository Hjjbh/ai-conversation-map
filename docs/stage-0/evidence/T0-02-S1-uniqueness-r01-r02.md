# T0-02 S1 非暴露唯一性摘要证据

## 运行范围

- 授权：`D0-08B`
- 页面：原 S1 专用、非敏感、可丢弃的静态 ChatGPT conversation
- 探针：`0.3.0` / schema `3` / policy `identity-summary-0.1`
- 探针 SHA-256：`1676F6A40C53833F69B5EF79A0A9ABA7D11AEECF23927DCCD134489762973D30`
- 测试：`node --test tools/stage-0/chatgpt-readonly-probe.test.js`，13/13 pass

## 脱敏结果

| 运行 | capturedAt | status | errorCodes | 消息计数 | 策略结果 |
|---|---|---|---|---|---|
| R01 | `2026-09-08T15:56:23.732Z` | `observed` | `[]` | 6（3 user / 3 assistant） | `data-message-id=unique/low`；`data-testid-role=unique/low` |
| R02 | `2026-09-08T15:57:14.530Z` | `observed` | `[]` | 6（3 user / 3 assistant） | `data-message-id=unique/low`；`data-testid-role=unique/low` |

两次运行的 `strategyCount=2`、`conflictCount=0`、`valueExposure=none`、`limitations=[]`；每个策略均为 `eligibleCount=6`、`presentCount=6`、`emptyCount=0`、`readErrorCount=0`、`distinctCount=6`、`duplicateGroupCount=0`、`roleConflictCount=0`。

## 清理与结论

- R02 后调用 `AICMReadonlyProbe.dispose()`，返回 `true`；运行额度已关闭，未继续调用 `run()`。
- 本证据不包含属性原值、原值长度、哈希、正文、URL、DOM、locator、账号信息或网络数据。
- 允许结论：两个候选策略在同一 S1 静态快照中均生成了可重复的非暴露唯一性候选摘要，诊断置信度最高为 `low`。
- 不允许结论：不证明跨刷新、跨页面版本、跨账户的稳定 ID，也不改变 T0-02 的身份状态 `unknown`。
