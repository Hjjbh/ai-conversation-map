# T0-02 S1 非暴露唯一性摘要授权方案

## 1. 方案状态与决策目的

- 决策编号：`D0-08A`（方案与实现准备，尚未授权运行）；运行绑定另用 `D0-08B`。
- 任务：T0-02 会话/消息稳定身份验证。
- 主责：ADP；复核：GDE + QSR；最终批准：PO。
- 目标：在专用、非敏感、可丢弃的 S1 合成 ChatGPT 会话中，验证候选消息属性是否具有“唯一、重复、缺失或冲突”的**非暴露摘要**。
- 本方案不输出属性原值、真实来源 ID、URL、正文、DOM、哈希或 locator，不创建稳定来源键，也不执行定位、分支或状态变更。
- 本方案只准备授权边界。候选探针修订、精确 SHA-256、QSR 放行和 PO 对 `D0-08B` 的明确批准全部完成前，不得运行页面探针。

当前 S1 身份矩阵已记录：既有探针只报告属性存在性，不能判断唯一性。本方案只补足“值不外露的唯一性摘要”这一证据缺口，不能替代 T0-02 的跨刷新、流式、编辑、重试或回答版本验收。

## 2. 申请范围

| 项目 | 限定范围 |
|---|---|
| 方案决策编号 | `D0-08A` |
| 运行决策编号 | `D0-08B`（已绑定并获 PO 批准） |
| 目标页面 | 原 S1 专用、非敏感、可丢弃的合成 ChatGPT 会话 |
| 页面状态 | 3 个已完成 Question + Answer Turn 的静态页面；不刷新、不新增消息 |
| 候选探针 | `0.3.0`、schema `3`；实现文件 SHA-256：`1676F6A40C53833F69B5EF79A0A9ABA7D11AEECF23927DCCD134489762973D30` |
| 运行编号 | `T0-02-S1-UNIQUENESS-R01`、`T0-02-S1-UNIQUENESS-R02` |
| 新增运行次数 | 两次，均为同一静态 DOM 生命周期内的独立只读读取 |
| 输出 | 仅值不外露的白名单 JSON 摘要；不得保存原值或可逆派生值 |
| 权限 | 沿用已批准的当前 ChatGPT 页面只读范围；不新增 host、storage、network 或调试权限 |
| 有效期 | R01、R02 完成或任一熔断条件触发后立即失效 |

### 2.1 运行授权的附加前置条件

下列条件必须全部满足，才可把本方案转化为实际运行授权：

1. 完成 `0.3.0` 候选探针实现和本地单元/合成测试（D0-08A 已完成）。
2. 探针仅在内存中暂时读取待比较的属性值；返回对象、全局对象、异常对象和日志均通过白名单序列化。
3. QSR 复核输出字段、脱敏边界、唯一性算法、失败降级和清理路径，并给出实现级 PASS。
4. 在本文件中保留最终 `probeVersion`、`schemaVersion`、SHA-256、测试命令和 QSR 复核引用。
5. PO 已批准 `D0-08A` 方案/实现准备；页面运行还必须另行创建 `D0-08B`，绑定最终版本、schema、SHA-256 并取得包含这些字段的明确批准。仅批准 `D0-08A` 不产生页面运行额度。

## 3. 非暴露摘要契约

### 3.1 允许返回的字段

候选 schema 3 只允许返回以下类别；实现必须按本白名单固定字段，不得在运行时增加字段或自由字符串：

```json
{
  "schemaVersion": "3",
  "probeVersion": "0.3.0",
  "policyVersion": "identity-summary-0.1",
  "capturedAt": "timestamp",
  "status": "observed",
  "errorCodes": [],
  "page": {
    "surface": "chatgpt-web",
    "hostAllowed": true,
    "pathKind": "conversation",
    "mainRegionFound": true
  },
  "summary": {
    "messageCount": 6,
    "userCount": 3,
    "assistantCount": 3,
    "strategyCount": 1,
    "conflictCount": 0,
    "valueExposure": "none"
  },
  "candidateStrategies": [
    {
      "strategyId": "data-message-id",
      "scope": "message-root",
      "eligibleCount": 6,
      "presentCount": 6,
      "emptyCount": 0,
      "readErrorCount": 0,
      "distinctCount": 6,
      "duplicateGroupCount": 0,
      "roleConflictCount": 0,
      "candidateStatus": "unique",
      "evidenceConfidence": "low",
      "valueExposure": "none"
    }
  ],
  "limitations": []
}
```

字段约束：

- 顶层允许键固定为 `schemaVersion`、`probeVersion`、`policyVersion`、`capturedAt`、`status`、`errorCodes`、`page`、`summary`、`candidateStrategies`、`limitations`；`page`、`summary` 和策略对象也只能使用示例中列出的键，未知键一律阻断。
- `status` 只能是 `observed`、`blocked` 或 `error`；`errorCodes` 只能使用预登记的抽象错误码，最多 8 项，不得包含自由文本、异常消息或页面数据。
- `errorCodes` 必须来自固定集合 `PROTOCOL_NOT_ALLOWED`、`HOST_NOT_ALLOWED`、`CONVERSATION_PATH_REQUIRED`、`MAIN_REGION_NOT_FOUND`、`MAIN_REGION_AMBIGUOUS`、`MESSAGE_CANDIDATE_LIMIT_EXCEEDED`、`MESSAGE_CONTAINER_OUTSIDE_ROOT`、`ROLE_CONTAINER_CONFLICT`、`MESSAGE_CANDIDATES_NOT_FOUND`、`OUTPUT_SCHEMA_MISMATCH`、`VALUE_EXPOSURE_BLOCKED`、`RUN_QUOTA_EXHAUSTED`、`PROBE_DISPOSED`、`PROBE_RUNTIME_FAILURE`、`S1_SHAPE_REQUIRED`；单次最多 8 项且不得重复，按上述列举顺序输出。
- `status=observed` 时 `errorCodes` 必须为空；`status=blocked` 或 `error` 时至少包含一个固定错误码，且不得借错误码字段携带其他文本。
- `page.surface` 只能是 `chatgpt-web` 或阻断态的 `unconfirmed`；`page.hostAllowed` 只能是布尔值；`page.pathKind` 只能是 `conversation`、`home`、`other` 或 `unknown`。不得返回其他站点、完整路由或 URL。
- `strategyId` 只能来自构建版本固定的预登记集合 `data-message-id`、`data-testid-role`，单次最多返回 2 个策略；不得返回属性值、选择器文本或 DOM 片段。
- `candidateStrategies` 只能按预登记顺序 `data-message-id` → `data-testid-role` 输出；是否省略不适用策略只能由静态策略适用性决定，不得由候选原值、去重结果或调用方输入改变顺序。
- `scope` 固定为 `message-root`；`eligibleCount` 是纳入比较的消息根数量。
- 所有计数必须是有界非负安全整数：`0 ≤ messageCount ≤ 20`、`0 ≤ strategyCount ≤ 2`、`0 ≤ candidateStrategies.length ≤ 2`、`strategyCount === candidateStrategies.length`；`eligibleCount ≤ messageCount`。
- `userCount + assistantCount ≤ messageCount`；`summary.conflictCount` 必须等于 `candidateStrategies` 中 `candidateStatus` 为 `duplicate` 或 `ambiguous` 的策略数量，且 `0 ≤ conflictCount ≤ strategyCount`。
- 对每个策略必须满足 `eligibleCount = presentCount + emptyCount + readErrorCount`、`0 ≤ distinctCount ≤ presentCount`、`0 ≤ duplicateGroupCount ≤ floor(presentCount / 2)`、`0 ≤ roleConflictCount ≤ duplicateGroupCount`。
- `duplicateGroupCount` 是出现至少两次的相同候选值等价组数量；`roleConflictCount` 是跨越两个或以上角色的重复组数量；两者都不返回组成员或值。
- `eligibleCount`、`presentCount`、`emptyCount`、`readErrorCount`、`distinctCount`、`duplicateGroupCount` 和 `roleConflictCount` 只是受上限和不变量约束的计数，不是值的编码、长度或哈希。
- `candidateStatus` 必须由计数和冲突结果计算，不接受页面或调用方传入，且按固定优先级计算：`eligibleCount = 0` 为 `not-observed`；存在 `readErrorCount > 0` 或 `roleConflictCount > 0` 为 `ambiguous`；否则 `duplicateGroupCount > 0` 为 `duplicate`；否则 `emptyCount > 0` 为 `partial`；其余仅在 `eligibleCount > 0`、`presentCount = eligibleCount`、`readErrorCount = 0`、`distinctCount = presentCount` 且无重复/冲突时为 `unique`。
- `candidateStatus` 枚举固定为 `unique`、`duplicate`、`partial`、`ambiguous`、`not-observed`；`evidenceConfidence` 枚举固定为 `low`、`unknown`；`valueExposure` 只能为 `none`。
- `evidenceConfidence` 在 `candidateStatus` 为 `unique`、`duplicate`、`partial` 或 `ambiguous` 时固定为 `low`；在 `not-observed` 时固定为 `unknown`。
- `candidateStatus=duplicate`、`partial`、`ambiguous` 或 `not-observed` 必须如实保留；不得为了得到 `unique` 而筛选节点或重试挑选结果。任何状态都不是平台稳定 ID 结论。
- `evidenceConfidence` 是“本次诊断摘要”的置信度，不能写入 `identityConfidence`，不能升级到 Tier 1/2。
- `valueExposure` 必须固定为 `none`。任一原值、原值数组、原值长度、原值哈希、可逆映射或异常上下文进入返回对象都属于熔断。
- `limitations` 只能使用固定集合 `CANDIDATE_EMPTY`、`DUPLICATE_CANDIDATE`、`ROLE_CONFLICT`、`VALUE_READ_ERROR`、`VALUE_EXPOSURE_BLOCKED`，单次最多 8 项且不得重复，按上述列举顺序输出；不得写入自由文本、正文片段或异常上下文。
- `capturedAt` 只能由探针本地时钟生成标准 UTC ISO-8601 字符串（等价于 `Date.prototype.toISOString()`），不得取自页面、候选属性或异常文本。正常运行路径若本地时钟不可用，探针必须直接返回固定 `PROBE_RUNTIME_FAILURE` 终态；该终态允许 `capturedAt: null`，不得继续读取页面。若探针已经 `dispose()` 或达到运行配额，`PROBE_DISPOSED`/`RUN_QUOTA_EXHAUSTED` 终态优先，时钟不可用时同样允许 `capturedAt: null`，且不得读取页面。
- D0-08A 的实现必须在读取任何候选属性前验证 S1 静态范围：去重后的消息根恰好 6 个，角色恰好 3 个 `user` 与 3 个 `assistant`，并按 `user → assistant` 严格交替；否则返回 `status=blocked`、`errorCodes=["S1_SHAPE_REQUIRED"]` 和空 `candidateStrategies`。
- 不计算正文内容指纹，不读取网络响应、Cookie、令牌或账户信息，不把摘要写入 IndexedDB、`chrome.storage`、剪贴板或远端服务。

### 3.2 内存处理边界

1. 仅在用户明确纳入探针的 S1 合成页面中，短暂读取候选属性值并在内存中进行精确字符串比较。
2. 比较完成后只保留白名单计数和状态；释放候选值数组、临时映射和异常对象，不挂到 `window`、闭包、日志或跨消息缓存。
3. 不生成 `sourceConversationKey`、`sourceMessageKey`、`locator`、内容指纹或任何持久化迁移候选。
4. `dispose()` 必须清理全局探针对象、observer、临时缓存和事件监听；页面刷新、关闭或切换时不沿用上次内存状态。

预登记的 `errorCodes` 和 `limitations` 集合必须在实现评审时固定为本文列举的集合；不得把集合之外的文本直接返回。每个错误码和限制码只能由固定模板映射，不得携带异常 message、stack、DOM 或属性文本；`limitations` 同样按本文列举顺序去重输出。

## 4. 允许动作

### R01：静态页面基线

1. 人工确认仍位于原 S1 专用、非敏感、可丢弃的静态会话，且页面没有新增消息。
2. 核对候选探针版本、schema、最终 SHA-256 与本文件已补充的批准记录一致。
3. 手动调用一次 `run()`，仅预览白名单 JSON，登记为 `T0-02-S1-UNIQUENESS-R01`。
4. 通过敏感字段检查后，将完整脱敏摘要转交 TL；不得复制、改写或补造字段。
5. 暂不运行 R02，等待 TL 确认 R01 已安全接收且未触发熔断；若同一受控操作窗口内未收到确认，立即调用 `dispose()`，R02 额度自动作废。

### R02：同生命周期重复读取

1. 仅在 TL 明确确认 R01 已接收后，在同一静态页面再次手动调用一次 `run()`。
2. 登记为 `T0-02-S1-UNIQUENESS-R02`，保留独立 `capturedAt`；不得复制 R01 输出冒充新运行。
3. 预览并转交白名单摘要后立即调用 `dispose()`；两次运行额度用尽。探针内部必须以调用计数强制最多接受两次 `run()`，第三次调用只返回固定错误码 `RUN_QUOTA_EXHAUSTED`，不得重新读取页面。

除上述动作外，本方案不授权任何页面交互、刷新、定位、滚动、高亮、点击或状态改变。

## 5. 明确禁止

- 不访问私人、业务、历史或非 S1 合成会话。
- 不刷新、关闭、切换会话，不新建标签页，不新增或删除消息。
- 不发送、编辑、停止、重试、重新生成、分支、归档、删除或分享。
- 不点击复制、反馈、继续生成或其他页面控件。
- 不读取 Cookie、令牌、账户区域、其他标签页、浏览历史、下载、书签、网络请求/响应或私有接口。
- 不输出或保存真实属性值、会话/消息 ID、URL、正文、DOM、locator、哈希、长度、映射表或迁移候选。
- 不使用网络、`fetch`、XHR、WebSocket、剪贴板、下载、本地存储、远程 LLM、遥测或云同步。
- 不运行 S2/S3，不把本方案额度转用于 T0-01、T0-03、T0-04 或其他探针版本。
- 不因 `duplicate`、`partial`、`ambiguous`、`not-observed`、`blocked` 或 `error` 结果追加运行，不把失败结果改写为 `unique`。

## 6. 逐次熔断与异常处理

出现任一条件时，立即停止当前运行，不转交违规输出；页面仍可操作时调用 `dispose()`，只向 TL/QSR 报告抽象错误码和运行编号：

安全的可恢复摘要与致命熔断必须区分：

- 若单个候选值读取失败但探针仍能确认白名单序列化、值未外露且其余计数不变量成立，则返回 `status=observed` 的摘要，令该槽位计入 `readErrorCount`，将策略标记为 `ambiguous`，并在 `limitations` 使用 `VALUE_READ_ERROR`；不得把异常文本带入 `errorCodes`。
- 若角色冲突或重复组可以在内存中完成比较且未暴露值，则返回 `status=observed` 的摘要，使用 `roleConflictCount`/`duplicateGroupCount` 和对应固定限制码；这不是违规输出，也不提升身份置信度。
- 若无法证明候选值已被完全抑制、计数不变量不成立、根节点歧义无法安全摘要，或任一非白名单数据进入对象，则返回 `status=blocked` 或 `error`、固定 `errorCodes`，`candidateStrategies` 必须为空，不保留部分策略摘要。

1. 探针版本、schema、策略版本或 SHA-256 不匹配。
2. 页面不是原 S1 合成会话，或去重后的消息根不是 6 条、角色不是 3+3、顺序不是严格 `user → assistant` 交替；候选属性读取前必须以 `S1_SHAPE_REQUIRED` 阻断。
3. 返回对象未通过**精确字段白名单**校验，或出现精确禁止键/模式（如 `rawValue`、`attributeValue`、`sourceId`、`conversationId`、`messageId`、`url`、`text`、`dom`、`locator`、`hash`、`token`、`cookie`、`stack`、`message`）；不得用对合法键名的简单子串匹配代替白名单校验。`strategyId`、`valueExposure` 等合法字段不因名称包含 `id`/`value` 而触发熔断。
4. 任一错误对象、调试输出、全局变量、扩展消息或临时文件包含候选原值、正文、URL 或 DOM。
5. 探针尝试使用网络、持久化、剪贴板、下载、额外权限或页面状态变更能力。
6. 出现多个候选根、无法安全摘要的候选值读取/比较错误，或算法需要读取完整正文才能继续；可安全计数的角色冲突或单槽位读取错误按本节前述可恢复路径处理。
7. 页面刷新、关闭、切换或新增消息；R01 未确认接收前尝试运行 R02。
8. `dispose()` 已执行；任何仍被调用方持有的旧引用再次调用 `run()` 只能返回固定 `PROBE_DISPOSED`，不得访问页面。
9. 任一页面 getter、`closest()`、`contains()` 或其他运行时读取抛出异常；探针必须吞掉异常对象并返回固定 `PROBE_RUNTIME_FAILURE` 终态，不得把异常 message/stack 带入任何出口。

熔断后不得为了“补齐样本”继续运行；任何恢复都需要修订方案、QSR 复核和新的 PO 决策。

## 7. 验收口径

### 7.1 R01/R02 共同检查

1. 两份输出均为批准的 schema、探针版本和策略版本；`valueExposure` 均为 `none`。
2. 页面结构摘要内部一致：S1 预期为 6 条消息、3 用户、3 Assistant；角色/顺序只能作为结构事实。
3. `candidateStrategies` 只包含预登记策略名、计数、状态和非身份诊断置信度；不存在候选原值、原值长度、哈希或 locator。
4. 两份结果删除各自 `capturedAt` 后，字段集合、策略顺序和计数/状态一致；差异必须如实登记。
5. 自动敏感模式扫描、白名单结构断言、探针合成测试和 QSR 人工复核全部通过。

### 7.2 允许形成的有限结论

- 若某策略在两次静态读取中均为 `unique` 且计数一致，只能记录“该策略在本 S1 快照中的非暴露唯一性候选摘要可重复生成”。
- 该结论的诊断置信度最高为 `low`；不产生 Tier 1/2，不证明页面刷新后、其他账户、其他页面版本或动态状态中的稳定性。
- 若出现 `duplicate`、`partial`、`ambiguous` 或 `not-observed`，只记录冲突/缺失事实并保持身份 `unknown`；不得自动合并、重挂接布局/注释、创建 branch 或覆盖旧映射。
- R01/R02 不包含刷新，因此不能关闭 T0-02 的跨刷新 ID-02，也不能替代 T0-03 locator 验证。

## 8. 证据与保留

正式证据只允许保留：

- 运行编号、时间、探针/schema/策略版本、页面类型、消息/候选计数、状态、错误码、`valueExposure` 和脱敏限制。
- 结果 JSON 的仓库规范化字节 SHA-256（只用于完整脱敏证据文件完整性，不对属性值或正文计算哈希）。
- 自动扫描结果、人工复核角色、批准引用和本方案版本。

不得保留：属性原值、原始 URL、完整正文、DOM、候选哈希/长度、账号信息、Cookie、令牌、网络数据或本地值映射表。证据文件在进入仓库前必须通过自动扫描和非作者人工复核。

## 9. PO 决策区

### 推荐决定

`D0-08A` 已获 PO 授权并完成方案/实现准备。页面运行还必须独立创建 `D0-08B`，绑定最终版本、schema、SHA-256、测试结果和 QSR 实现级 PASS。任何“批准 D0-08A”文字都不得被解释为 R01/R02 放行。

`D0-08B` 是唯一的运行批准编号，现已在本节绑定最终 `probeVersion`、`schemaVersion`、SHA-256、策略版本、测试结果和 QSR 引用，并由 PO 明确批准。该批准只放行 R01/R02 的限定页面读取，不放行其他会话、其他版本或任何页面交互。

### 待填写的运行绑定

```text
probeVersion: 0.3.0
schemaVersion: 3
probeSha256: 1676F6A40C53833F69B5EF79A0A9ABA7D11AEECF23927DCCD134489762973D30
policyVersion: identity-summary-0.1
testCommand: node --test tools/stage-0/chatgpt-readonly-probe.test.js
testResult: 13/13 pass
QSR review: implementation-level PASS (2026-09-08)
PO approval: D0-08B approved for R01/R02 with the exact binding above
```

### 当前状态

**D0-08A 已获 PO 授权并完成本地实现/测试，GDE 与 QSR 实现级复核均 PASS；D0-08B 已按完整绑定获 PO 批准，R01/R02 已完成并通过清理，脱敏证据见 [T0-02-S1-uniqueness-r01-r02.md](evidence/T0-02-S1-uniqueness-r01-r02.md)。**

### 不在本方案内的后续事项

- 跨刷新唯一性或 ID 稳定性：另行制定生命周期授权，不沿用 D0-08A/D0-08B 额度。
- T0-03 双向定位：另行制定只读滚动/聚焦/短暂高亮授权。
- S2/S3、编辑、重试、回答版本、分支和任何状态变更：必须分别提交任务步骤、清理/回滚和 PO 批准。
