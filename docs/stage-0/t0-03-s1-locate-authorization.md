# T0-03 S1 临时单向定位动作授权方案（双向链路前置验证）

## 1. 方案状态与决策目的

- 决策编号：`D0-09A`（方案与实现准备，尚未授权运行）；运行绑定另用 `D0-09B`。
- 任务：T0-03 双向定位技术验证。
- 主责：ADP + UIE；独立复核：GDE + QSR；最终批准：PO。
- 目标：在专用、非敏感、可丢弃的 S1 合成 ChatGPT 会话中，验证“选定目标 → 受限滚动 → 可见性确认 → 短暂高亮 → 清理”的动作生命周期，并区分请求受理、目标找到和定位成功。
- 本方案不证明平台稳定 ID、跨刷新 locator、地图投影或真实分支；不持久化 DOM 引用、正文、属性原值、URL 或定位键。运行期间允许使用短命内存引用完成一次动作，`dispose()` 时必须清空。
- `D0-09A` 只准备契约和测试边界；页面运行必须遵守已单独绑定的 [D0-09B 运行授权](d0-09b-s1-locate-run-authorization.md)，不得以 D0-09A 单独放行页面定位动作。

## 2. 前置证据与边界

- T0-02 D0-08B 已在同一 S1 快照中证明两个候选策略可生成 `unique/low` 非暴露摘要，但不产生稳定身份结论。
- T0-02 的 R01/R02 额度已用尽；本方案不得复用其运行额度、探针版本或输出冒充定位证据。
- 当前仅验证页面动作机制，目标以一次性结构序号指定；序号是测试选择器，不是 `sourceMessageKey`、稳定 ID 或可持久化 locator。
- 目标固定为第 4 条消息（`assistant`）的临时测试目标；如页面结构不是 S1 的 6 条、3 user/3 assistant、严格交替，立即阻断。
- 本单元是完整 T0-03 的临时页面动作例外，不解除 `03-navigation-protocol.md` 对稳定 locator、双向链路和 T0-05 的阻塞。

## 3. 申请范围

| 项目 | 限定范围 |
|---|---|
| 方案决策编号 | `D0-09A` |
| 运行决策编号 | `D0-09B`（已创建并获 PO 批准） |
| 目标页面 | 原 S1 专用、非敏感、可丢弃的静态 ChatGPT conversation |
| 目标消息 | 结构序号 4、角色 `assistant`；不读取正文或属性原值 |
| 动作 | 临时定位、一次受限滚动、视觉区域确认、短暂视觉高亮、确认后清理 |
| 不允许 | 点击、输入、发送、编辑、停止、重试、重新生成、分支、刷新、导航、打开新标签页、永久样式 |
| 输出 | 固定白名单诊断摘要：结构计数、目标序号/角色、阶段状态、确认布尔值、错误码、清理结果 |
| 运行次数 | R01/R02 各一次；同一静态 DOM 生命周期；R01 未安全接收则作废 R02 |
| 动作授权 | `D0-09B` 精确授权一次有界、非持久化但可见的滚动副作用，以及最多 1000 ms、必须清理的自有高亮；不等同于纯只读授权 |
| 扩展权限 | 不新增 host、storage、network、debugger 或动态脚本权限 |

动作参数和时限固定为：每次运行最多一次 `scrollIntoView({ block: "center", behavior: "auto" })`，滚动确认总时限 1500 ms；不调用 `focus()`、不改变 `activeElement`、不设置 `tabindex`、不派发键盘/鼠标事件；高亮仅使用插件自有、`pointer-events: none` 的临时 overlay，最长 1000 ms，清理 watchdog 截止时间 1500 ms，单次运行总时限 5000 ms。每次运行使用 run-local abort 令牌；`dispose()` 或截止时间到达后，轮询/清理重试在再次读取页面或操作 overlay 前必须退出。每次运行的 timer、overlay 和临时 listener 在 `finally` 中释放；跨 R01/R02 的生命周期哨兵只在探针会话结束、熔断或 `dispose()` 时断开并清空。

角色分类只使用两个固定 CSS selector（`[data-message-author-role="user"]` 与 `[data-message-author-role="assistant"]`）的命中集合；不调用 `getAttribute()` 读取角色或候选属性原值。插件自有 overlay 以仅内存对象身份集合确认所有权；命名空间标记不单独构成信任依据，外部同名节点仍触发会话熔断。

## 4. 非暴露动作摘要契约

### 4.1 允许字段

候选 schema 1 只允许以下固定字段，不得返回自由文本、正文、原始 URL、DOM、属性值或可逆派生值：

```json
{
  "schemaVersion": "1",
  "probeVersion": "0.1.0",
  "policyVersion": "locate-summary-0.1",
  "capturedAt": "2026-09-09T00:00:00.000Z",
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
    "targetOrdinal": 4,
    "targetRole": "assistant",
    "targetCount": 1,
    "scrollAttempted": true,
    "scrollConfirmed": true,
    "focusConfirmed": true,
    "highlightApplied": true,
    "highlightCleared": true,
    "valueExposure": "none"
  },
  "limitations": [
    "TARGET_IS_EPHEMERAL",
    "LOW_LOCATION_CONFIDENCE",
    "NO_STABLE_ID_CONCLUSION"
  ]
}
```

字段约束：

- 顶层、`page` 和 `summary` 只能使用示例中的键；`status` 只能为 `observed`、`blocked` 或 `error`。`page.surface` 只能为 `chatgpt-web` 或前置失败短路值 `unknown`，`page.pathKind` 只能为 `conversation` 或 `unknown`，`summary.targetRole` 只能为 `assistant`（本方案目标）。出现 `unknown` 时必须同时为 `hostAllowed=false`、`mainRegionFound=false`，不得伪造页面已检查结论。
- `capturedAt` 必须是探针本地 UTC 时钟生成的 `YYYY-MM-DDTHH:mm:ss.sssZ`；若首次取时钟失败，允许唯一运行终态 `capturedAt:null` + `status=error` + `PROBE_RUNTIME_FAILURE`，`page` 使用 `surface/pathKind=unknown`、`hostAllowed=false`、`mainRegionFound=false`，`summary` 计数为 0 且不得继续读取页面或输出异常对象、message、stack、时间错误细节。对已达到配额或已 dispose 的短路调用，不读取时钟，允许 `capturedAt:null`，并分别返回 `RUN_QUOTA_EXHAUSTED` 或优先级更高的 `PROBE_DISPOSED`，同时使用同一组 unknown/false/0 固定短路值。
- `messageCount`、`userCount`、`assistantCount` 均为 `0..6` 整数；通过 S1 形状门禁时必须分别为 `6/3/3`，否则不得执行目标动作。`targetOrdinal` 固定为 `4`；`targetCount` 只能为 `0` 或 `1`，表示可安全操作的目标数，不输出候选总数。
- `scrollAttempted`、`scrollConfirmed`、`focusConfirmed`、`highlightApplied`、`highlightCleared` 只能为布尔值；`valueExposure` 只能为 `none`。没有逐阶段确认不得报告成功。
- `focusConfirmed` 只表示视觉区域确认：目标矩形在同一视口内完整可见；不执行 DOM/键盘 focus，不读取或输出 `activeElement`。
- `errorCodes` 必须来自固定白名单，按登记顺序去重，最多 3 项；`limitations` 必须来自固定白名单，按登记顺序去重，最多 4 项，禁止自由文本。
- 成功终态 `status=observed` 的不变量为：`errorCodes=[]`、`targetCount=1`、`scrollAttempted=true`、`scrollConfirmed=true`、`focusConfirmed=true`、`highlightApplied=true`、`highlightCleared=true`、`valueExposure="none"`，且至少包含 `TARGET_IS_EPHEMERAL`、`LOW_LOCATION_CONFIDENCE`、`NO_STABLE_ID_CONCLUSION` 三个限制码。
- `status=blocked` 只表示尚未开始页面动作的前置门禁失败，必须有错误码，所有动作确认值为 `false`、`targetCount=0`；页面动作开始后发生的生命周期变化、阶段失败、输出违规或清理问题统一为 `status=error`，必须有错误码，可保留已观测事实（例如清理失败时 `targetCount=1`、`highlightApplied=true`、`highlightCleared=false`），但绝不视为成功证据。
- 清理正常在 1500 ms 内确认则可报告 `highlightCleared=true`；若首次清理异常但 watchdog 在截止时间前完成，仍可为 `observed`，仅追加 `HIGHLIGHT_CLEANUP_WARNING`。截止时间内未确认清理必须为 `error` + `HIGHLIGHT_CLEANUP_FAILED`，立即 `dispose()` 并作废 R02；不得修改目标原有样式，若自有 overlay 因环境故障残留则该残留本身是失败证据，不得继续动作。

### 4.2 固定错误码与限制

预登记错误码（固定顺序）：`PROTOCOL_NOT_ALLOWED`、`HOST_NOT_ALLOWED`、`CONVERSATION_PATH_REQUIRED`、`MAIN_REGION_NOT_FOUND`、`MAIN_REGION_AMBIGUOUS`、`S1_SHAPE_REQUIRED`、`TARGET_NOT_FOUND`、`TARGET_AMBIGUOUS`、`TARGET_ROLE_MISMATCH`、`SCROLL_NOT_CONFIRMED`、`FOCUS_NOT_CONFIRMED`、`HIGHLIGHT_NOT_CONFIRMED`、`HIGHLIGHT_CLEANUP_FAILED`、`CONVERSATION_CHANGED`、`PERMISSION_NOT_GRANTED`、`PROBE_RUNTIME_FAILURE`、`RUN_QUOTA_EXHAUSTED`、`PROBE_DISPOSED`。

限制码只允许：`TARGET_IS_EPHEMERAL`、`LOW_LOCATION_CONFIDENCE`、`NO_STABLE_ID_CONCLUSION`、`HIGHLIGHT_CLEANUP_WARNING`；按固定顺序去重，禁止自由文本。

`TARGET_AMBIGUOUS` 表示目标序号命中两个或以上候选，终态必须为 `blocked`、`targetCount=0`；`HIGHLIGHT_CLEANUP_FAILED` 表示高亮未能在 watchdog 截止时间内移除，终态必须为 `error`，可保留 `targetCount=1` 与真实布尔状态但不得继续动作。`HIGHLIGHT_CLEANUP_WARNING` 只允许出现在最终已确认清理的 `observed` 结果中。

错误状态映射固定为：协议、host、路径、main-region、S1 形状、目标缺失/歧义/角色不符、权限检查在任何页面动作前失败时为 `blocked`；滚动、视觉区域确认、高亮、生命周期、运行时、清理和字段校验失败为 `error`。运行次数达到上限且探针尚未 dispose 时返回 `blocked` + `RUN_QUOTA_EXHAUSTED`；已 dispose 的引用再次调用始终优先返回 `blocked` + `PROBE_DISPOSED`，不检查配额、时钟或页面。发生多个错误时仍按登记顺序去重，超过 3 项只保留最早 3 项。

## 5. 运行步骤（仅在 D0-09B 批准后）

### R01：单次目标定位基线

1. 人工确认仍在原 S1 静态页面，没有刷新、新增消息、流式生成或会话切换；唯一入口是用户在插件面板点击一次“定位 S1 第 4 条 Assistant”，禁止页面加载或 observer 自动运行。
2. 核对 D0-09B 绑定的探针版本、schema、策略版本、动作参数、清理策略、实现 SHA-256 和测试结果；任一不一致立即停止。
3. 在 D0-09B 授权会话开始、R01 之前建立仅内存的探针会话哨兵：保存当前 `Document`、main-region 对象、S1 结构计数和当前会话路径指纹的引用/快照，不输出、不持久化；哨兵跨 R01/R02 持续监听 `popstate`/`hashchange`/`beforeunload`/`pagehide`/`visibilitychange`、main-region 替换、消息数量/角色变化、属性/文本变化和非自有 DOM 变更，并锁存失效状态。同形结构的路径变化也必须失效。每次 run 的临时目标引用只在该 run 存在；会话结束、熔断或 `dispose()` 时断开 observer、移除所有 listener、清空哨兵与目标引用。自有 overlay 位于 main-region 外并仅按对象身份忽略，不掩盖 main-region 的其他变更。
4. 点击回调只使用临时序号目标和上述固定角色 selector 命中，不读取正文或候选属性原值。
5. 按 `scrolling → viewport visibility/focus check → short highlight → cleanup` 顺序执行；滚动最多一次，视觉确认要求目标矩形完整处于同一视口，高亮最多 1000 ms。
6. 记录 `T0-03-S1-LOCATE-R01` 脱敏摘要；通过敏感字段检查后交给 TL/GDE/QSR。任何生命周期变化、目标歧义或清理失败均立即熔断、调用 `dispose()`，R02 作废；若 R01 成功，保留同一探针会话哨兵等待 R02，不在 R01 的 `finally` 中提前 dispose。

### R02：同一生命周期重复定位

1. 仅在 TL 确认 R01 安全接收且未触发熔断、且同一探针会话哨兵仍有效后执行。
2. 保持同一页面、同一目标序号和同一 DOM 生命周期；不得刷新、导航、关闭/切换标签页或新增消息；哨兵任一信号变化立即作废剩余额度。
3. 记录 `T0-03-S1-LOCATE-R02`，独立生成 `capturedAt`；不得复制 R01 输出。
4. 完成后立即按 watchdog 策略清理高亮并调用 `dispose()`；此后旧引用只返回 `PROBE_DISPOSED` 且不读页面。仅在尚未 dispose 且额度已耗尽的合成/防御性调用中返回 `RUN_QUOTA_EXHAUSTED`，该第三次调用不属于授权运行。

## 6. 明确禁止

- 不把结构序号、视觉位置或临时 DOM 句柄写成稳定 `sourceMessageKey`、`turnKey` 或持久化 locator。
- 不读取或保存正文、标题、局部文本锚点、属性原值、URL 参数、Cookie、令牌或网络数据。
- 不点击 ChatGPT 控件，不发送、编辑、停止、重试、重新生成、分支、分享或改变会话状态。
- 不将“请求已送达”“调用了滚动”“找到相似节点”视为定位成功；必须逐项确认目标、可见性、高亮和清理。
- 不在目标不唯一、角色不匹配、会话切换、页面异常或清理失败后追加运行或自动猜测。
- 不把临时生命周期哨兵或自有 overlay 的 DOM 变更当作会话消息；哨兵必须忽略自有命名空间，但不得忽略 main-region 的其他变更。

## 7. 熔断与验收

出现以下任一情况，立即停止并返回固定错误码：页面/协议/权限不符、S1 结构不符、目标缺失、多个目标（`TARGET_AMBIGUOUS`）或角色不符、滚动/视觉区域确认/高亮/清理未确认、会话切换或 main-region 替换、消息新增、运行时异常、字段白名单不符或任何敏感数据进入出口。页面动作开始后触发的熔断统一为 `status=error`，保留已观测布尔值但不构成成功证据。

共同验收：

1. R01/R02 均为批准 schema、探针版本和策略版本；`valueExposure=none`。
2. 两次均只报告结构序号和布尔确认，不含正文、属性值、ID、locator、DOM 或哈希。
3. 成功必须同时满足 `targetCount=1`、`scrollConfirmed=true`、`focusConfirmed=true`、`highlightApplied=true`、`highlightCleared=true`，且页面/Document/main-region 哨兵未变化；`focusConfirmed` 不代表 DOM focus。
4. 允许结论仅为“同一静态 S1 页面中的临时目标可完成一次受限定位动作并清理”；不产生稳定 ID、跨刷新 locator 或双向地图定位结论。
5. 任何 `TARGET_IS_EPHEMERAL`、`LOW_LOCATION_CONFIDENCE` 或失败码均保持 T0-02 身份未知，不自动重挂接地图元数据。

## 8. 进入 D0-09B 前置条件

1. 定位摘要探针与合成测试已完成：`probeVersion=0.1.0`、`schemaVersion=1`、实现 SHA-256=`DE6009330A133C0A8DBFDD65241190E7E9B62664BDBF4645D414153FECF5BBD9`，测试文件 SHA-256=`12C8867DDE0CA84465AF87CE2ECF0CBA75938A9BE5E4F2A3D8A325C40A9BC0EF`，合成测试 `18/18 pass`；D0-09B 创建时仍须重新核对工作树和哈希。
2. GDE 与 QSR 分别独立复核动作边界、生命周期哨兵、无正文/无原值出口、异常清理、权限和失败降级，并给出实现级 PASS。
3. [D0-09B 运行授权](d0-09b-s1-locate-run-authorization.md) 已绑定最终输出字段/枚举、动作参数与时限、cleanup watchdog 策略、实现/测试 SHA-256、测试结果和 R01/R02 失效规则，并获 PO 明确批准；执行前仍须重新核对哈希。
4. D0-09B 首次只开放当前未刷新 S1 的 R01；仅在 R01 安全接收后开放 R02。刷新、关闭/切换标签页、会话切换、新增消息或任一熔断均立即使剩余额度作废。
5. 仅在 D0-09B 批准后执行页面动作；本 D0-09A 文档不产生运行额度。

## 9. 当前状态

**D0-09A 方案与实现准备已完成；D0-09B 已创建并获 PO 批准；T0-03 真实页面定位动作尚未运行。**

后续跨刷新稳定 ID、正式 `sourceLocator`、地图到原聊天和原聊天到地图的完整双向链路，必须分别取得证据和授权。
