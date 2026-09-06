# T0-04 ChatGPT 分支公开能力与技术验证计划

## 1. 文档状态

- 阶段：阶段 0 技术探针。
- 任务：T0-04“真实分支路径验证”。
- 主责：ADP；复核：TL + QSR；最终批准：PO。
- 当前授权：公开官方资料与本地项目文档核对。
- 尚未授权：访问真实账号页面，以及执行分支、编辑、重试、填充或发送等状态变更。

本文是初步能力说明和后续验证计划，不是 ADR-008 的最终决策，也不是 A–E 等级放行结论。

## 2. 两类结论必须严格分开

### 2.1 已由公开官方资料支持的产品事实

OpenAI 的 ChatGPT 发布说明在 2025-09-04 的“Branch conversations on web”条目中说明：ChatGPT Web 提供从某条消息的“更多操作”菜单选择“Branch in new chat”，从该点开始一个独立聊天；该条目称功能面向已登录 Web 用户提供。

- 官方来源：[ChatGPT — Release Notes](https://help.openai.com/en/articles/6825453-chatgpt-app-features)
- 本项目访问日期：2026-09-06。
- 可得结论：ChatGPT Web 公开存在用户可见的会话分支功能，产品语义是从指定消息点创建独立聊天并保留原线程。

### 2.2 公开资料不能证明的技术事实

上述官方说明没有给出，也不能被本项目推定为已经验证：

- 当前页面是否对本探针环境、账号、语言或会话类型显示该入口。
- 入口对应的 DOM 结构、语义属性、选择器或菜单挂载方式是否稳定。
- 任意 Question 或 Answer Turn 是否都可作为可识别的分支起点。
- 分支后是否打开同标签页、新标签页或以何种路由时序完成导航。
- 页面上是否暴露稳定的新会话 ID、源会话 ID、父消息 ID 或其他可持久锚点。
- 插件是否能仅凭公开、可见页面能力可靠确认“目标会话 + 父消息锚点”。
- 扩展能否合规自动点击该入口，哪些步骤必须保留真实用户手势。
- 重复点击、取消、超时、失败、慢路由、多标签页或页面升级时的幂等性和恢复方式。

因此，“公开存在分支功能”不等于“DOM 稳定”，也不等于“可自动化”“可可靠取证”或“已经达到 A 级”。截至本文编写时，后四项均为未验证。

## 3. 初步能力状态

| 维度 | 当前状态 | 证据与限制 |
|---|---|---|
| Web 产品具有用户可见分支功能 | 公开资料确认 | 官方发布说明；未做账号内复核 |
| 可见入口在目标环境存在 | 未验证 | 禁止访问真实账号页面 |
| DOM/选择器可识别且稳定 | 未验证 | 官方资料不构成 DOM 契约 |
| 分支起点与父消息可持久关联 | 未验证 | 尚无父锚点证据 |
| 新会话引用可可靠取得 | 未验证 | 尚无路由或 URL 证据 |
| 插件自动化合规性 | 未验证 | 尚未定义获批用户手势边界 |
| A–E 最终等级 | 未确认 | 必须完成真实页面验证；当前不得判 A/B |

当前可将原生分支视为“候选 A 路径”，但能力快照应报告 `unverified`，UI 和图谱不得据此创建 `branch` 边。

## 4. T0-04 分阶段步骤

### B0：公开能力核对（本轮允许）

1. 保存官方页面标题、URL、条目日期、访问日期和简要释义。
2. 明确官方资料确认的产品事实与未披露的实现细节。
3. 对照 ADR-007、ADR-008 和 A–E 降级语义，形成待验证问题清单。
4. 不从页面文案反推出 DOM、ID、路由或自动化稳定性。

### B1：可见 UI 只读观察（尚未授权）

前置条件：T0-05 和样本范围已获 PO 批准，且使用专门可丢弃测试会话。

1. 用户手动打开已批准的 ChatGPT Web 测试会话。
2. 仅观察消息菜单是否存在分支入口，记录入口适用的消息角色、完成状态、语言和会话类型。
3. 记录可访问性信息、结构关系和候选识别策略；不点击会创建分支的控件。
4. 至少重复观察 3 个获批消息点，并记录入口缺失或禁用的情况。
5. 形成“入口存在性”证据，但不判定真实分支成功。

### B2：用户执行的受控状态变更（尚未授权）

前置条件：每一步的可见影响、用户手势、取消/清理方案及证据字段获 TL、QSR 复核并由 PO 逐项批准。

1. 用户在可丢弃样本中手动选择官方可见分支操作；探针不得自动发送、编辑或重试。
2. 只观察导航是否发生、原会话是否保持不变、目标是否成为独立会话。
3. 从可见页面事实中分别获取目标会话引用和父消息锚点候选；不得访问认证材料或私有接口。
4. 使用来源消息的合成标记验证目标上下文截至所选消息点；不记录完整正文。
5. 对成功、用户取消、入口消失、路由超时和引用不完整分别记录结果。
6. 清理由用户按预先批准的方式完成；探针不得自动删除或修改会话。

### B3：重复性、幂等与失败验证（尚未授权）

1. 在相同受支持环境下，对 3 个不同获批分支起点各执行 1 次受控验证。
2. 每次均独立确认来源会话、父消息锚点、目标会话和路由结果。
3. 重复操作测试必须使用新的逐项授权；不得为测试幂等而无确认地重复点击。
4. 目标已创建但确认超时时，只登记“孤立候选”，不自动关联、不创建 `branch`。
5. 汇总账号/会话类型、语言、页面版本和时间差异，避免把单次成功泛化为永久稳定。

### B4：等级判定与 ADR 草案

1. ADP 依据实际证据提出 A–E 等级及适用条件。
2. TL 与 QSR 双重复核目标引用、父锚点、隐私边界、失败路径和可重复性。
3. ADR-008 草案明确用户手势、自动化范围、回退等级和已知限制。
4. 只有 PO 最终批准后，等级才能成为实现输入；本文件不直接修改 ADR。

## 5. T0-04 证据格式

```yaml
evidenceId: T0-04-B2-R01
taskId: T0-04
sourceType: official-doc | local-doc | read-only-ui | approved-state-change
capturedAt: YYYY-MM-DDTHH:mm:ssZ
environment:
  surface: chatgpt-web
  browser: name-and-version
  locale: locale-label
  accountClass: anonymized-plan-or-unknown
  conversationClass: approved-synthetic-class
authorization:
  approvalRef: reference-or-not-applicable
  actor: user | observer
  allowedActions: []
branchPoint:
  role: user | assistant | unknown
  completionState: completed | other
  sourceConversationRef: redacted-ref-or-unavailable
  parentMessageAnchor: redacted-anchor-or-unavailable
observation:
  visibleEntry: true | false | unknown
  entryLabelMeaning: sanitized-summary
  userGestureRequired: true | false | unknown
  navigationMode: same-tab | new-tab | unknown | not-run
  routeSettled: true | false | unknown
  targetConversationRef: redacted-ref-or-unavailable
  sourceUnchanged: true | false | unknown
  contextBoundaryVerified: true | false | unknown
result:
  status: pass | fail | blocked | not-run
  proposedLevel: A | B | C | D | E | unconfirmed
  errorCodes: []
  confidence: high | medium | low
artifacts:
  sanitizedRecordPath: path-or-null
  sha256: hash-or-null
redaction:
  automatedScan: pass | fail | not-run
  humanReview: pass | fail | not-run
review:
  adpConclusion: sanitized-summary
  tlReview: approved | changes-requested | pending
  qsrReview: approved | changes-requested | pending
  poDecision: approved | rejected | pending
  limitations: []
```

### 建议错误码

| 错误码 | 含义 |
|---|---|
| `BRANCH_ENTRY_NOT_FOUND` | 已批准消息点没有可见分支入口 |
| `BRANCH_ACTION_NOT_AUTHORIZED` | 状态变更尚未逐项获批 |
| `BRANCH_USER_CANCELLED` | 用户取消，平台状态不应被视为成功 |
| `BRANCH_ROUTE_TIMEOUT` | 路由未在批准时间窗内稳定 |
| `BRANCH_TARGET_REF_MISSING` | 无法取得可持久目标会话引用 |
| `BRANCH_PARENT_ANCHOR_MISSING` | 无法取得或验证父消息锚点 |
| `BRANCH_CONTEXT_UNVERIFIED` | 目标上下文边界无法验证 |
| `BRANCH_AMBIGUOUS_CANDIDATE` | 出现一个或多个无法安全关联的目标候选 |
| `BRANCH_SCOPE_CHANGED` | 页面、账号或样本超出批准范围 |

错误码只表达可诊断事实，不得把“已发出请求”记录为成功。

## 6. A–E 判定与验收阈值

### 6.1 通用门槛

1. 公开资料核对、可见入口、路由行为、目标会话引用、父消息锚点、用户手势和失败路径均有独立证据。
2. 对拟支持环境中的 3 个不同获批分支起点，受控验证成功率必须为 100%；任何一次引用或锚点不完整都不能判 A/B。
3. 每次成功必须同时满足：平台操作完成、目标会话引用可持久、父消息锚点可验证、上下文边界符合所选起点、原会话未被意外改写。
4. 相同分支意图的重复或晚到结果不得提前产生多条边；不确定目标只登记孤立候选。
5. 所有状态变更由用户明确触发，自动发送保持禁止；任何需要新增权限或自动点击的方案须另行评审。
6. 证据和日志敏感信息命中数为 0，并通过 QSR 人工复核。

### 6.2 等级判定

| 等级 | 必须满足的证据 | 图谱表达 |
|---|---|---|
| A | 官方可见原生分支在受支持环境完成，且 3/3 同时取得目标会话引用和父锚点 | PO 批准后才可创建 `branch` 实线 |
| B | 编辑/继续等平台路径经单独授权验证，3/3 结果可确认并满足与 A 相同的引用门槛 | PO 批准后可创建 `branch` 实线并记录策略 |
| C | A/B 不满足；用户确认的新会话仅带入派生上下文，来源关系可说明但不是平台原生分支 | 仅 `reference` 虚线，标注 `derived-context` |
| D | 只能在用户预览并确认后复制上下文或填充草稿，未取得目标会话事实 | 不创建边 |
| E | 能力不可用、被策略禁止或无法安全验证 | 不修改图并显示原因 |

若实际证据不足以判定任何等级，状态保持 `unconfirmed`，不得为了阶段退出强行归入 A–E。

## 7. 禁止范围与熔断

### 7.1 明确禁止

- 当前阶段访问真实账号会话或点击任何会改变会话状态的控件。
- 自动执行分支、编辑、重试、重新生成、填充、发送、分享、归档或删除。
- 调用未授权私有接口，读取 Cookie、令牌、网络请求/响应或绕过平台规则。
- 根据菜单文案、URL 外观、请求已发出或画布连线推定分支成功。
- 在目标会话引用或父消息锚点任一缺失时写入 `branch`。
- 把一次页面观察或一次成功泛化为 DOM 稳定、所有账号可用或永久可自动化。

### 7.2 立即停止条件

当授权不清、页面范围变化、需要自动发送、来源/目标身份歧义、父锚点缺失、路由无法稳定、原会话可能被改写、脱敏失败或出现认证信息时立即停止。只保留脱敏错误码；后续恢复须由 QSR/TL 复核，并按状态变更等级重新取得 PO 批准。

## 8. 当前初步结论

1. **已确认的公开事实**：OpenAI 官方发布说明记录 ChatGPT Web 存在用户可见的“Branch in new chat”功能。
2. **尚未确认的工程事实**：目标环境入口、DOM/选择器稳定性、路由模式、新会话引用、父消息锚点、用户手势边界、失败恢复和扩展自动化合规性均未验证。
3. **当前能力等级**：`unconfirmed`；原生功能仅作为候选 A 路径，不得创建真实 `branch`，ADR-008 继续保持“待技术探针”。
4. **下一门禁**：完成 T0-05 放行和专用测试会话批准后，可先执行 B1 只读 UI 观察；B2/B3 必须获得独立、逐项状态变更授权。

