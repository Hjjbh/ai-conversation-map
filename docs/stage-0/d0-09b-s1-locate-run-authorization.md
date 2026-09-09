# D0-09B：T0-03 S1 临时定位运行授权与批准记录

## 1. 决策状态

- 决策编号：`D0-09B`。
- 上位方案：[D0-09A T0-03 S1 临时单向定位动作授权方案](t0-03-s1-locate-authorization.md)。
- 授权状态：**已创建并获 PO 批准**。
- 运行状态：R01 已执行但因 `CONVERSATION_CHANGED` 熔断；R02 未执行且已作废，当前无剩余运行额度。
- 批准依据：PO 明确指令“创建并批准 D0-09B”。该批准不等同于已执行 R01/R02，也不扩大到其他会话、版本或页面动作。

本决策只绑定已复核的定位摘要探针和同一 S1 静态合成会话。任何绑定字段、页面前置条件、动作参数或清理策略不一致，均立即停止，不得以旧批准补救。

## 2. 最终版本绑定

| 字段 | 已批准值 |
|---|---|
| 探针文件 | `tools/stage-0/chatgpt-locate-summary-probe.js` |
| 测试文件 | `tools/stage-0/chatgpt-locate-summary-probe.test.js` |
| `probeVersion` | `0.1.0` |
| `schemaVersion` | `1` |
| `policyVersion` | `locate-summary-0.1` |
| 实现 SHA-256 | `DE6009330A133C0A8DBFDD65241190E7E9B62664BDBF4645D414153FECF5BBD9` |
| 测试文件 SHA-256 | `12C8867DDE0CA84465AF87CE2ECF0CBA75938A9BE5E4F2A3D8A325C40A9BC0EF` |
| 测试命令 | `node --test tools/stage-0/chatgpt-locate-summary-probe.test.js tools/stage-0/chatgpt-readonly-probe.test.js` |
| 测试结果 | 定位测试 `18/18 pass`；Stage 0 全套 `31/31 pass` |
| GDE 复核 | 实现级 PASS（D0-09A 最终实现复核） |
| QSR 复核 | 实现级 PASS（最终工作树复核） |

D0-09B 执行前必须重新计算两份探针/测试文件 SHA-256，并与本表逐字匹配。探针或测试文件内容、运行边界、权限范围发生变化，或出现未预期的脏工作树，均作废本批准，须重新创建绑定；仅包含已复核授权文档和修改日志的原子提交不使本绑定失效，但运行前仍须复核工作树。

## 3. 页面与目标范围

仅允许以下页面和状态：

- 原 S1 专用、非敏感、可丢弃的 ChatGPT 合成会话；协议为 `https:`，host 为 `chatgpt.com` 或 `www.chatgpt.com`，路径为单个 conversation 路径。
- 页面只包含一个 `main` 区域和 6 个消息根，角色严格为 `user → assistant → user → assistant → user → assistant`。
- 目标固定为结构序号 4、角色 `assistant`；序号是本次测试选择器，不是稳定 ID、source locator 或可持久化键。
- 页面在 R01/R02 期间不得刷新、导航、切换会话、关闭/切换标签页、增加消息或进入流式生成。

以下任一条件不满足，R01/R02 不得开始或必须立即熔断：协议/host/path 不符、main 缺失或歧义、S1 形状不符、目标缺失/歧义/角色不符、会话路径或 `Document`/main-region 变化、页面隐藏/离页、消息或属性/文本结构变化、运行时异常或清理失败。

批准后、R01 开始前若页面刷新、关闭或切换标签页、切换会话、增加消息、进入流式生成或触发任一会话哨兵信号，R01 与 R02 全部额度立即失效；不得开始 R01，须重新创建授权。

## 4. 已批准动作和硬性上限

每次 `run()` 只允许按下列顺序执行，且只允许一次：

1. 读取固定 selector 命中集合并确认 S1 结构；不读取正文、属性原值、URL 参数或稳定 ID。
2. 对目标调用一次 `scrollIntoView({ block: "center", behavior: "auto" })`；滚动确认总时限 1500 ms。
3. 仅作视觉区域确认：目标矩形完整处于同一视口；不调用 `focus()`，不改变 `activeElement`，不设置 `tabindex`，不派发键盘/鼠标事件。
4. 在目标外部创建插件自有、`pointer-events: none` 的临时 overlay；本实现的可见窗口为 50 ms，最长不得超过 D0-09A 规定的 1000 ms。
5. 先隐藏 overlay，再在清理 watchdog 1500 ms 内确认移除；不得修改目标原有样式。清理失败必须返回 `error` + `HIGHLIGHT_CLEANUP_FAILED`，立即 dispose 并作废剩余额度。

单次运行总截止时间为 5000 ms。`dispose()` 或截止时间到达后，run-local abort 必须使轮询、清理重试和后续 DOM/overlay 操作退出。所有 timer、listener、临时目标引用和会话哨兵在结束时释放；若环境故障留下隐藏且不可交互的自有 overlay，只能作为失败证据，禁止继续运行。

明确不授权：点击、输入、发送、编辑、停止、重试、重新生成、分支、分享、刷新、导航、新标签页、永久样式、网络、存储、剪贴板、下载、远程 LLM、遥测、额外 host/storage/debugger 权限或任何会话状态变更。

## 5. 输出绑定

每次运行只能返回 D0-09A schema 1 的固定白名单对象：`schemaVersion`、`probeVersion`、`policyVersion`、`capturedAt`、`status`、`errorCodes`、`page`、`summary`、`limitations`。不得出现正文、属性值、URL、ID、locator、DOM、哈希、异常 message/stack、Cookie、令牌或网络数据；`valueExposure` 必须为 `none`。

成功 `observed` 仅在 `targetCount=1`、滚动/视觉确认/高亮/清理全部为 `true` 且会话哨兵未变化时成立。该结果最多支持“同一静态 S1 页面中的临时目标完成一次受限定位并清理”的结论，不支持稳定 ID、跨刷新 locator、地图双向链路或分支能力结论。

## 6. R01/R02 运行顺序

### R01：基线运行

1. 人工核对当前页面为本决策第 3 节规定的原 S1 静态合成会话。
2. 重新核对第 2 节的版本、schema、策略、实现/测试 SHA-256 和测试结果；不匹配即停止。
3. 仅通过已审查的项目入口手动调用一次 `AICMLocateSummaryProbe.run()`；登记 `T0-03-S1-LOCATE-R01`。不得自动运行、复制或改写输出。
4. 先做白名单和敏感字段检查，再把完整脱敏摘要交给 TL/GDE/QSR；未安全接收前不得运行 R02。
5. 任何熔断、错误、页面变化或清理问题均立即 `dispose()`，R02 自动作废。

### R02：同生命周期重复运行

1. 仅在 R01 已安全接收、未熔断且同一会话哨兵仍有效时执行。
2. 再次核对同一 `Document`、main-region、路径指纹和全部绑定字段；不得刷新、导航或改变页面。
3. 手动调用一次 `run()`，登记 `T0-03-S1-LOCATE-R02`；独立生成 `capturedAt`，不得复制 R01 输出。
4. 完成清理后立即 `dispose()`；旧引用只能返回 `PROBE_DISPOSED`，不得再次读取页面。R02 完成或任一熔断后，本决策额度耗尽并失效。

## 7. 失效、回溯与证据保留

- R01 未安全接收、R01/R02 间刷新/离页/切换、消息或结构变化、SHA-256 不一致、任一异常或清理失败，均使剩余额度立即失效；不得追加运行或复用批准。
- 只允许保留运行编号、批准绑定、时间、固定页面类别、结构/阶段布尔值、错误码、`valueExposure`、限制码和脱敏摘要完整性哈希；不得保留正文、原始 URL、DOM、属性值、账号信息或候选哈希。
- 本决策只用于 T0-03 临时单向定位前置验证；T0-03 完整双向定位、稳定 ID、正式 locator、真实分支和插件生产实现仍需单独证据与授权。

## 8. PO 批准记录

```text
decision: D0-09B
approval: approved
scope: T0-03 S1 temporary locate summary R01/R02 only
probeVersion: 0.1.0
schemaVersion: 1
policyVersion: locate-summary-0.1
implementationSha256: DE6009330A133C0A8DBFDD65241190E7E9B62664BDBF4645D414153FECF5BBD9
testSha256: 12C8867DDE0CA84465AF87CE2ECF0CBA75938A9BE5E4F2A3D8A325C40A9BC0EF
testResult: locate 18/18 pass; Stage 0 31/31 pass
pageScope: original S1 synthetic ChatGPT conversation only
actionScope: one bounded scroll + visual confirmation + temporary overlay with mandatory cleanup
R01: executed; error CONVERSATION_CHANGED; quota closed
R02: void; not executed because R01 returned CONVERSATION_CHANGED and triggered the fuse
```

批准人：PO（用户明确指令“创建并批准 D0-09B”）。

**当前结论：D0-09B 已创建并批准；R01 已熔断并登记失败证据，R02 未执行且额度已作废。**
