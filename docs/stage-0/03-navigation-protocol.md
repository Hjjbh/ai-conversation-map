# T0-03 跨入口通信与双向定位协议草案

## 1. 文档状态与范围

- 阶段：阶段 0 技术探针。
- 任务：T0-03“双向定位技术验证”的协议准备。
- 主责：ADP + UIE。
- 复核：QSR。
- 本文定义 Extension Page、Background 与 ChatGPT Content Script 之间的通信和定位判定，不是实现代码，也不代表真实页面验证已经完成。
- 本文不授权访问真实 ChatGPT 页面、保存真实聊天正文、发送消息、编辑/重试回答或创建分支。
- ChatGPT 原始会话仍是事实源；地图只使用可重建来源引用进行定位。

## 2. 目标与非目标

### 2.1 目标

1. 为跨入口消息提供版本化、可判别、可追踪的统一 envelope。
2. 区分请求已送达、已受理与操作真正成功，禁止把消息发送成功视为定位成功。
3. 为地图到原聊天、原聊天到地图规定可观察的成功条件和失败原因。
4. 处理页面重载、会话切换、旧响应晚到、重复点击、取消、超时及同会话多标签页。
5. 将通信内容和浏览器权限限制在当前操作所需的最小范围。

### 2.2 非目标

- 不定义 ChatGPT DOM 选择器；该事实由 ADP 负责。
- 不定义 Turn 投影、图谱或 Dexie schema；UIE 不绕过 GDE 的领域与 Repository 契约。
- 不传输或持久化 DOM 节点、认证信息、完整聊天正文或原始 DOM。
- 不定义真实分支协议、自动发送或任何可能改变 ChatGPT 会话内容的操作。

## 3. 参与入口与信任边界

| 入口 | 责任 | 可接受的输入 | 禁止事项 |
|---|---|---|---|
| Extension Page（地图） | 发起“地图到原聊天”；接收“原聊天到地图”；展开、居中、选中卡片 | 由扩展运行时交付且通过协议校验的消息 | 自行解析 ChatGPT DOM；直接操作 Dexie；以坐标推导逻辑关系 |
| Background | 请求路由、标签页选择、页面连接协调、打开/激活页面 | 扩展自身入口的受支持协议消息 | 长期保存正文；读取无关标签页内容；把路由成功当作定位成功 |
| Content Script | 获取当前会话/Turn 来源引用；执行受限滚动、聚焦和短暂高亮；返回 Adapter 结果 | 扩展运行时且来源、版本、类型均有效的消息 | 接受任意页面消息；保存 DOM 引用；自动发送聊天消息 |
| ChatGPT 页面 | 原始会话事实源和定位目标 | 用户已打开或经明确动作打开的规范会话 URL | 被插件修改消息、会话或账户状态 |

页面通过 `window.postMessage` 等开放页面总线发送的同形消息不得直接视为可信。若未来确需页面桥接，必须另建 ADR，规定 nonce、来源和最小暴露面，并经 QSR/TL 复核。

## 4. 统一消息 envelope

每条跨入口消息必须包含以下字段；字段缺失、类型不符或值不在白名单时拒绝处理，并仅返回脱敏错误。

| 字段 | 必需 | 说明 |
|---|---:|---|
| `protocol` | 是 | 固定协议命名空间，例如 `acm.navigation` |
| `version` | 是 | 协议主版本；不支持的主版本直接拒绝 |
| `kind` | 是 | `request`、`response`、`event` 之一 |
| `type` | 是 | 受支持的消息类型判别符 |
| `requestId` | 是 | 单次用户意图的不可复用关联 ID；事件也须关联原请求 |
| `idempotencyKey` | 请求必需 | 同一逻辑操作重试时保持不变；不同用户意图不得复用 |
| `sentAt` | 是 | 发送方时间，仅用于诊断；不作为安全或身份依据 |
| `deadlineAt` | 请求必需 | 绝对截止时间；接收方不得启动已过期操作 |
| `source` | 是 | `map`、`background`、`content-script` 之一 |
| `target` | 是 | 预期接收入口；不匹配则拒绝 |
| `conversationRef` | 定位请求必需 | 最小化来源会话引用；不包含标题或正文 |
| `operationRevision` | 是 | 当前请求的单调修订号，用于压制晚到响应 |
| `payload` | 是 | 与 `type` 对应的最小字段集合 |

响应还必须包含：

| 字段 | 说明 |
|---|---|
| `status` | `accepted`、`progress`、`succeeded`、`cancelled`、`failed` 之一 |
| `respondingTo` | 原请求的 `requestId` |
| `error` | 非成功结果的结构化错误；仅含白名单字段 |
| `result` | 成功结果的最小证据；不得含 DOM 引用或聊天正文 |

结构化错误只允许包含 `code`、`stage`、`retryable`、`safeMessageKey`、脱敏 `diagnosticId` 和有限 `details`。不得直接序列化页面异常、任意 payload、完整 URL、局部文本锚点原文或 DOM 对象。

## 5. 消息类型与请求/响应

### 5.1 地图到原聊天

| 类型 | 方向 | 最小 payload | 完成响应 |
|---|---|---|---|
| `NAVIGATE_TO_SOURCE` | Map → Background | `turnKey`、`sourceLocator`、`openIfMissing`、`userInitiated` | Background 在 Content Script 返回最终结果后转发 `succeeded` 或结构化失败 |
| `LOCATE_SOURCE` | Background → Content Script | `turnKey`、`sourceLocator`、期望 `conversationRef`、高亮策略标识 | `sourceLocated`、实际会话引用、采用的定位策略、完成时间、可选脱敏诊断 ID |
| `CANCEL_OPERATION` | 任一发起方 → 当前执行方 | 目标 `requestId`、`operationRevision` | `cancelled`；若已完成则返回终态，不伪造取消成功 |

`sourceLocator` 是可序列化、可重建的来源定位信息。优先级为稳定消息 ID、稳定属性组合、来源序号加内容指纹、局部文本锚点。局部文本锚点原文不得进入日志或通用诊断；持久化规则由身份契约和隐私边界共同决定。

### 5.2 原聊天到地图

| 类型 | 方向 | 最小 payload | 完成响应 |
|---|---|---|---|
| `REVEAL_IN_MAP` | Content Script → Background | `conversationRef`、`turnKey`、来源动作类型、`userInitiated` | Background 在 Map 返回最终结果后转发终态 |
| `FOCUS_MAP_TURN` | Background → Map | `conversationRef`、`turnKey`、`syncIfMissing` | `mapTurnFocused`、展开路径结果、居中结果、选中结果、当前投影修订号 |
| `SYNC_TURN_REQUEST` | Map → Application/Background 路由 | `conversationRef`、`turnKey` 或最小来源引用 | 同步成功、低置信度、找不到或结构化失败；同步协议本身由投影契约定义 |
| `CANCEL_OPERATION` | 任一发起方 → 当前执行方 | 目标 `requestId`、`operationRevision` | 同上 |

### 5.3 生命周期事件

| 类型 | 生产者 | 用途 |
|---|---|---|
| `CONTENT_CONNECTION_CHANGED` | Background | Content Script 已连接、断开或重新加载；不携带正文 |
| `CONVERSATION_CONTEXT_CHANGED` | Content Script | 页面切换到其他会话或来源身份修订；使旧请求失效 |
| `OPERATION_PROGRESS` | 当前执行方 | 报告 `routing`、`opening`、`waiting-page`、`locating`、`syncing`、`focusing` 等有限状态 |

生命周期事件不得替代最终响应。UI 只能根据同一 `requestId`、当前 `operationRevision` 的终态更新最终结果。

## 6. 操作状态机

统一状态如下：

`idle → routing → opening/activating → waiting-page → locating/syncing → focusing/highlighting → succeeded`

任一非终态均可进入 `cancelling`、`failed` 或 `timed-out`；`cancelling` 最终进入 `cancelled` 或返回已产生的真实终态。状态规则：

1. 每次用户动作创建新的 `requestId`；同一动作的安全重试沿用 `idempotencyKey`。
2. 对同一 UI 目标，新修订启动后，旧修订的 progress 和终态只记脱敏诊断，不得覆盖当前 UI。
3. 页面会话引用变化后，所有尚未完成且目标为旧会话的请求进入失败或重新选路，不得继续高亮当前页面中的相似文本。
4. `succeeded`、`failed`、`cancelled`、`timed-out` 为终态，同一请求不得再次转换。
5. 关闭进度提示或取消等待不代表页面动作可被物理回滚；若页面已打开或标签页已激活，响应必须如实说明该可见副作用。

## 7. 错误码

| 错误码 | 阶段 | 可重试 | 含义/默认处理 |
|---|---|---:|---|
| `INVALID_ENVELOPE` | validation | 否 | envelope 缺失或类型错误；拒绝处理 |
| `UNSUPPORTED_PROTOCOL_VERSION` | validation | 否 | 主版本不兼容；提示更新扩展 |
| `UNTRUSTED_MESSAGE_SOURCE` | validation | 否 | 来源或目标校验失败；熔断并记录脱敏诊断 |
| `REQUEST_EXPIRED` | validation | 是 | 接收时已超过 deadline；由用户重新发起 |
| `OPERATION_SUPERSEDED` | coordination | 否 | 已被更高 revision 取代；静默压制旧结果 |
| `OPERATION_CANCELLED` | coordination | 否 | 用户或系统取消 |
| `NO_MATCHING_TAB` | routing | 视配置 | 未找到已打开目标会话；仅在用户允许时可打开规范 URL |
| `AMBIGUOUS_TAB_TARGET` | routing | 否 | 多个候选无法按规则唯一选择；要求用户选择 |
| `TAB_UNAVAILABLE` | routing | 是 | 标签页关闭、无权限或不可访问 |
| `INVALID_CANONICAL_URL` | routing | 否 | URL 缺失、域名不在允许列表或会话引用不匹配；禁止打开 |
| `PAGE_NOT_READY` | page | 是 | 等待窗口内 Content Script 未就绪 |
| `CONVERSATION_MISMATCH` | page | 是 | 页面实际会话与目标不同；禁止定位 |
| `SOURCE_LOCATOR_MISSING` | locate | 否 | 无可用定位句柄；请求重新同步 |
| `SOURCE_NOT_FOUND` | locate | 是 | 支持策略均未找到目标；提供重新扫描 |
| `SOURCE_MATCH_AMBIGUOUS` | locate | 否 | 多个候选且置信度不足；禁止高亮或自动选择 |
| `LOW_LOCATION_CONFIDENCE` | locate | 是 | 低于批准阈值；保留旧地图并请求重新扫描 |
| `SCROLL_NOT_CONFIRMED` | locate | 是 | 未确认目标进入预期可视范围 |
| `HIGHLIGHT_NOT_CONFIRMED` | locate | 是 | 未确认高亮已应用；不得报告成功 |
| `TURN_NOT_PROJECTED` | map | 是 | 地图缺少目标 Turn；先发起增量同步 |
| `SYNC_FAILED` | map | 是 | 增量同步失败；展示诊断，不选择近似卡片 |
| `MAP_FOCUS_NOT_CONFIRMED` | map | 是 | 未完成祖先展开、居中或选中之一 |
| `PERMISSION_NOT_GRANTED` | permission | 否 | 所需权限未批准；说明受限能力，不诱导扩大授权 |
| `INTERNAL_ERROR` | any | 视情况 | 已脱敏的未知故障；不得附带原始异常或页面内容 |

错误码面向程序判别；用户文案通过 `safeMessageKey` 映射，不能直接展示页面异常文本。

## 8. 超时、取消与重试

### 8.1 建议探针时间预算

以下为阶段 0 待实测默认值，不是永久产品常量：

| 环节 | 建议上限 | 超时结果 |
|---|---:|---|
| 内部消息受理 | 2 秒 | `PAGE_NOT_READY` 或 `TAB_UNAVAILABLE` |
| 激活已有标签页并等待连接 | 10 秒 | `PAGE_NOT_READY` |
| 打开规范 URL 并等待页面就绪 | 20 秒 | `PAGE_NOT_READY` |
| Adapter 定位、滚动和高亮确认 | 8 秒 | 对应定位确认错误 |
| 地图增量同步 | 10 秒 | `SYNC_FAILED` |
| 地图展开、居中和选中 | 5 秒 | `MAP_FOCUS_NOT_CONFIRMED` |
| 单次端到端定位 | 30 秒 | `REQUEST_EXPIRED`，终止后续步骤 |

每一跳继承原请求 `deadlineAt`，不得通过内部重试无限延长总时限。实测报告应记录 P50/P95 和超时样本，再由 TL 决定阶段 1 默认值。

### 8.2 取消

- UI 在非终态提供安全取消；取消只阻止尚未执行的后续步骤。
- 执行方在打开页面、开始定位、开始同步及应用高亮前检查取消标记和 deadline。
- 取消确认包含最后完成阶段，不声称已撤销标签页激活、滚动或已出现的短暂高亮。
- 取消后到达的旧响应按 `requestId + operationRevision` 丢弃，不得重新改变选择或提示。

### 8.3 重试与幂等

- 相同 `idempotencyKey + operationRevision + type` 在去重窗口内只执行一次；重复消息返回已知进度或终态。
- 传输失败重试保持原 `requestId` 和幂等键；用户明确再次点击产生新 `requestId`，但 UI 可在当前操作未终止时合并重复点击。
- 定位操作可重复，但不得重复打开多个目标标签页、并发产生多次地图页或叠加永久高亮。
- Background 仅保留有界、短期、无正文的操作索引；扩展重启后未完成请求统一失效，不恢复为成功。

## 9. 多标签页选路

Background 按以下顺序选择 ChatGPT 目标页；任一步均须先验证 `conversationRef`，不能只依据标题或文本相似度：

1. 用户刚从其页面发起 `REVEAL_IN_MAP` 的确切 `tabId`，且仍连接并保持同一会话。
2. 已连接、会话引用精确匹配、最近由用户激活的标签页。
3. 已连接、会话引用精确匹配、最近成功完成插件操作的标签页。
4. 仅有一个精确匹配且健康的已连接候选。
5. 无匹配时，仅当请求由明确用户动作触发、`openIfMissing=true` 且规范 URL 通过允许域及引用校验，才打开新标签页。

以下情况返回 `AMBIGUOUS_TAB_TARGET` 并让用户选择，不自动猜测：多个候选活跃度相同、会话引用只能低置信度匹配、候选处于不同会话修订或身份契约报告漂移。

选中标签页后建立短期路由租约，绑定 `requestId`、`tabId`、`conversationRef` 和页面连接实例 ID。页面重载、Content Script 重连或会话切换会使租约失效，必须重新验证后继续。`tabId` 只用于运行时路由，不持久化为会话身份。

## 10. 双向定位成功判定

### 10.1 地图到原聊天

只有同时满足以下条件才返回 `succeeded`：

1. 最终标签页实际会话引用与请求目标一致。
2. Adapter 使用受支持策略唯一解析到目标来源消息，且置信度达到批准阈值。
3. 目标元素在当前页面连接实例中仍有效；未使用持久化 DOM 引用。
4. 滚动完成后确认目标进入预期可视范围。
5. 短暂高亮已成功应用到该目标，且页面会话未在过程中切换。
6. Content Script 返回 `sourceLocated` 证据，Background 将该最终响应转发给原 Map 请求。

标签页被打开/激活、消息被路由、找到相似文本或发出滚动调用均不单独构成成功。高亮结束后的清理失败可以作为非阻断告警记录，但不得留下永久样式或影响 ChatGPT 正常使用。

### 10.2 原聊天到地图

只有同时满足以下条件才返回 `succeeded`：

1. Content Script 在用户触发点获得唯一、达到阈值的 `turnKey` 与会话引用。
2. Background 打开或激活正确的地图实例，并将请求交付给该实例。
3. 地图验证其工作区/会话与请求一致。
4. 若 Turn 尚未投影，增量同步成功且得到同一 `turnKey`；禁止自动选择相似卡片。
5. 目标卡片的祖先路径已展开，卡片已进入画布可视区域并成为当前选中项。
6. Map 返回 `mapTurnFocused` 证据及当前投影修订号，终态回传到发起 Content Script。

打开地图页、同步请求已提交、仅滚动画布或仅改变选中状态均不足以单独构成成功。

## 11. 最小权限依赖

本节仅说明协议依赖的能力，不是 Manifest 最终权限名称或批准清单；实际名称须在脚手架阶段依当时浏览器规范核对。

| 能力 | T0-03 用例 | 数据范围 | 触发与保留 |
|---|---|---|---|
| 精确 ChatGPT 会话页访问 | Content Script 识别当前会话、定位、滚动和短暂高亮 | 仅用户纳入探针的声明域和会话页 | 用户打开或明确定位动作；不保留 DOM |
| 扩展内部消息通信 | Map、Background、Content Script 传递操作和结果 | envelope、来源引用、定位句柄及脱敏诊断 | 操作期间；有界去重信息短期保留 |
| 标签页查询/激活的最窄可用能力 | 在已有目标页面间选路和激活 | 匹配所需的 tab ID、连接状态、会话引用；不读取无关正文 | 用户定位动作；tab ID 不持久化 |
| 新建标签页能力 | 目标会话未打开时打开经校验的规范 URL | 已验证允许域内的规范 URL | 仅明确用户动作且 `openIfMissing=true` |
| 扩展本地存储（若探针需要） | 保存无正文设置或脱敏定位统计 | 协议版本、错误码、耗时、脱敏 ID | 按 T0-05 批准范围；正文禁止进入普通日志 |

默认不需要 `scripting`、剪贴板、浏览历史、下载、书签、Cookie、WebRequest、调试器、全站通配 host 权限或任何第三方网络访问。静态 Content Script 若能覆盖已批准用例，不申请动态脚本注入能力。权限未获批准时返回 `PERMISSION_NOT_GRANTED`，不得静默扩大访问范围。

## 12. 安全、隐私与熔断

- 只传当前定位所需数据；摘要、标题、回答正文和选中文本不属于本协议必需字段。
- `conversationRef`、`turnKey`、`sourceLocator` 按敏感来源标识处理，展示和诊断时最小化。
- 接收方校验扩展来源、目标入口、协议版本、消息类型、请求 ID、截止时间和 payload 白名单。
- 页面身份、目标身份或协议来源无法验证时立即停止操作。
- 低置信度、多候选或会话切换时禁止高亮、禁止选择近似卡片、禁止覆盖稳定映射。
- 定位失败不得影响 ChatGPT 正常使用；observer、临时样式和事件监听必须可释放。
- 任一消息包含认证材料、完整正文、原始 DOM、未知字段中的敏感内容或未授权外发目标时熔断并交由 QSR/TL 复核。

## 13. 验收矩阵

真实验证须在 T0-05 获批后使用专用测试会话执行；本表当前仅定义用例与证据格式。

| 编号 | 场景 | 预期结果 | 必留脱敏证据 |
|---|---|---|---|
| N-01 | 地图定位，目标标签页已连接 | 正确标签页激活、唯一消息进入可视区并高亮，返回 `succeeded` | 请求/终态、策略编号、耗时、会话匹配布尔值 |
| N-02 | 地图定位，目标标签页不存在 | 仅在用户动作及 `openIfMissing` 允许时打开规范 URL；就绪后定位成功 | URL 校验结果、页面就绪耗时、最终定位结果 |
| N-03 | 页面重载后继续定位 | 旧租约失效，重连后重新验证会话并完成；旧连接响应被压制 | 连接实例修订、失效原因、最终 revision |
| N-04 | 长会话中的早期 Turn | 不依赖当前可见 DOM 假设；成功或返回明确 `SOURCE_NOT_FOUND`/置信度错误 | 会话长度区间、策略编号、耗时、错误码 |
| N-05 | 定位过程中会话切换 | 停止旧请求，返回 `CONVERSATION_MISMATCH`，不高亮相似文本 | 切换事件、终态、无误高亮确认 |
| N-06 | 多标签页打开同一会话 | 按选路规则选择最近活跃且健康页面；歧义时要求用户选择 | 候选数、选路规则编号、目标 tab 脱敏 ID |
| N-07 | 旧响应晚到 | 低 revision 响应不改变当前 UI 或最终状态 | 当前/旧 revision、压制计数 |
| N-08 | 重复点击或传输重试 | 不重复开页、不产生并发高亮；返回同一已知进度或终态 | 幂等命中、执行次数、终态 |
| N-09 | 用户取消 | 后续步骤停止；已激活/滚动等副作用如实报告；旧响应被忽略 | 取消阶段、最后完成阶段、终态 |
| N-10 | 定位句柄缺失或目标不存在 | 不报告成功；提示重新同步/扫描并给出稳定错误码 | 错误码、策略尝试计数、正文零记录确认 |
| N-11 | 多个来源候选或低置信度 | 返回歧义/低置信度错误，不自动选择或高亮 | 候选数、置信度区间、熔断结果 |
| N-12 | 原聊天“在地图中查看”，Turn 已存在 | 地图实例激活，祖先展开、居中、选中均确认 | 投影 revision、三项确认、耗时 |
| N-13 | 原聊天到地图，Turn 尚未投影 | 先增量同步；同一 `turnKey` 出现后完成，否则 `SYNC_FAILED` | 同步结果、键一致性、终态 |
| N-14 | 地图实例未打开 | 打开或复用唯一地图实例后完成定位，不创建无界重复实例 | 实例数、路由结果、最终焦点结果 |
| N-15 | 协议版本或消息来源非法 | 请求被拒绝且无页面动作，返回相应安全错误 | 校验项、错误码、页面动作次数为零 |
| N-16 | 权限未批准或被撤销 | 返回 `PERMISSION_NOT_GRANTED`，不尝试扩大访问 | 权限检查结果、访问动作次数为零 |
| N-17 | 任一环节超时 | 到 deadline 后停止后续步骤，迟到成功不得覆盖超时终态 | deadline、最后阶段、迟到响应压制 |
| N-18 | 高亮生命周期 | 高亮短暂可见并自动清理，不遗留永久样式或阻断页面交互 | 应用/清理确认、清理告警（如有） |

建议通过标准：经批准的三类脱敏样本分别覆盖两个方向；定位成功率按产品目标达到 95% 以上；所有失败样本均有稳定错误码；误定位、旧响应覆盖、重复开页、正文日志泄露和未经授权权限使用均为零容忍项。

## 14. 验证报告最小字段

每个用例报告：用例编号、样本类别、协议版本、Adapter/策略版本、方向、起止时间、状态迁移、选路规则、定位策略、最终错误码或成功证据、是否发生取消/重试/会话切换、脱敏诊断 ID。报告不得包含真实标题、正文、局部锚点原文、完整 URL 参数、真实消息 ID、认证材料或原始 DOM。

## 15. 进入真实验证前的阻塞项

- T0-05 最小权限和数据处理边界尚需 TL 复核与 PO 最终批准。
- T0-02 尚需提供稳定 `conversationRef`、`turnKey`、`sourceLocator` 及置信度契约。
- ADP 尚需确认页面就绪、会话切换、定位成功和高亮清理的可观察信号。
- TL 尚需批准协议主版本策略、地图实例复用方式、多标签页歧义交互和阶段 0 超时默认值。
- QSR 尚需确认验收证据模板、敏感字段扫描和零容忍项。
- 专用测试会话和三类脱敏样本未获对应访问授权前，不执行真实页面定位。

## 16. 当前结论

T0-03 已具备协议级验证准备：入口职责、消息 envelope、请求/响应、状态、错误码、超时/取消/幂等、多标签页选路、双向成功判定、最小权限依赖和验收矩阵均已定义。本文没有产生真实页面证据；待阻塞项解除后，ADP 与 UIE 才能按本协议执行专用测试会话验证，并由 QSR 独立复核。
