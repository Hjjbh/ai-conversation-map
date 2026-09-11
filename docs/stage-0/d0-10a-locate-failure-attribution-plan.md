# D0-10A：T0-03 定位熔断归因与分级重试方案

## 1. 决策状态

- 决策编号：`D0-10A`。
- 状态：方案已准备，等待 PO 批准；尚未实现新探针，未产生任何真实页面运行额度。
- 上游证据：[D0-09B R01 定位运行熔断记录](evidence/T0-03-S1-locate-r01.md)。
- 适用范围：解释 D0-09B R01 的固定失败形状，并规定下一版非暴露归因探针、合成测试和后续独立授权门禁。
- 明确排除：不得复用 D0-09B，不执行滚动、高亮、聚焦、导航、输入、发送、分支或数据外发。

## 2. 已有结果的代码路径归因

D0-09B R01 返回 `status=error`、`errorCodes=["CONVERSATION_CHANGED"]`、`page` 为固定 unknown、`summary` 为零值。结合已绑定的 0.1.0 实现，该形状精确对应以下入口短路路径：

1. `runInternal()` 开始时已经存在内存 `session`。
2. `session.invalidated === true`，或当前 `Document` 对象不再等于 `session.documentRef`。
3. 探针在任何滚动、视口检查或临时高亮动作之前调用 `failForInvalidSession()`。
4. `failAndDispose()` 自动移除监听、清空会话并删除全局入口。

因此可以确认：

- 本次报告对应动作前熔断，没有到达滚动或高亮分支。
- 零计数是早期终态的固定脱敏默认值，不代表页面没有消息。
- `page=unknown` 是早期熔断的固定输出，不是重新完成 host、path 或 main-region 检查后的页面结论。
- 随后手动调用 `dispose()` 出现全局对象不存在，与自动销毁行为一致。
- 本次没有形成定位成功、稳定身份、locator 或双向链路证据。

当前 schema 不能证明：

- 哪个页面事件、DOM 变化、路径变化或 `Document` 替换首先触发失效。
- 语义上的会话是否真的变化，或操作人是否执行过导航、刷新或重复调用。
- 熔断时目标消息和 S1 结构是否仍然存在。

特别说明：该固定形状意味着本次报告对应的探针实例此前已建立过会话哨兵；但现有输出没有运行序号和首因字段，不能据此断言操作人重复执行。该结论仅是实现代码路径推断。

## 3. 下一版最小非暴露归因契约

若 D0-10A 获批，后续候选实现使用新的 probe/schema/policy 版本，并只新增一个固定白名单对象：

```json
{
  "changeAttribution": {
    "runOrdinal": 1,
    "phase": "preflight",
    "trigger": "visibility-change",
    "actionStarted": false
  }
}
```

字段约束：

| 字段 | 允许值 | 语义 |
|---|---|---|
| `runOrdinal` | `0`、`1`、`2` | 当前实例的有界调用序号；`0` 仅用于无法建立调用序号的短路终态 |
| `phase` | `preflight`、`scroll-wait`、`viewport-check`、`highlight`、`cleanup`、`final-check`、`unknown` | 首个终态信号发生时的固定阶段 |
| `trigger` | `none`、`visibility-change`、`pagehide`、`beforeunload`、`navigation-event`、`path-mismatch`、`document-mismatch`、`main-replaced`、`message-dom-mutation`、`hook-install-failed`、`deadline`、`disposed`、`unknown` | 首个被锁存的固定归因类别；`none` 仅表示观察窗口内没有失效信号，`unknown` 只表示已发生异常但无法归因 |
| `actionStarted` | boolean | 是否已进入任何可见页面动作阶段 |

实现必须遵守：

1. 只锁存第一个 trigger；多个信号采用确定性的 first-wins，不输出事件次数、顺序或时间差。
2. 在进入每一阶段前先更新固定 `phase`，再执行该阶段逻辑。
3. 内部比较可以使用当前路径等值、对象身份和 DOM 哨兵，但这些值不得进入输出、日志或 fixture。
4. 任一异常只映射为固定 `unknown` 与既有 `PROBE_RUNTIME_FAILURE`；不得输出异常类型、消息或堆栈。
5. 终态继续保持 `valueExposure=none`；`dispose()` 后清空 session、归因状态、监听器、observer、timer 和 overlay。
6. `trigger=unknown` 必须作为异常终态熔断，绝不能表示“未观察到变化”；只有 `trigger=none` 可以表达干净观察窗口。
7. `runOrdinal` 使用独立的有界调用序号，不复用或暗示旧版 quota 内部计数。

严禁新增或输出：URL、路径值或指纹、selector、DOM/事件/MutationRecord、节点或属性名称与值、正文、消息 ID、几何信息、精确时差、异常文本、Cookie、令牌、网络数据以及自由文本诊断。

## 4. 合成测试与静态门禁

候选实现必须在本地合成环境覆盖：

1. `changeAttribution` 四字段精确 schema、类型、枚举和未知键拒绝。
2. 每种内部触发源只映射到一个固定 trigger；多信号只保留首因。
3. `runOrdinal` 可区分首次和第二次入口，且实现不得自动调用 `run()`。
4. 各 phase 边界注入失效信号后不得误报动作成功。
5. 同形路径变化只输出 `path-mismatch`，不泄露路径或哈希。
6. 自有 overlay 变化被忽略，main-region 内其他变化触发 `message-dom-mutation`。
7. URL、正文、ID、属性值、DOM、事件和异常诱饵不会出现在结果或序列化输出中。
8. deadline、dispose、额度用尽或熔断后不再读取页面，也不遗留监听、observer、timer 或 overlay。
9. 静态检查确认没有网络、存储、剪贴板、click、focus、导航写入或新增扩展权限。
10. 旧版定位测试与 Stage 0 全套测试继续通过；最终实现和测试 SHA-256 在任何运行授权中逐字绑定。

GDE 与 QSR 必须对最终实现、测试、输出字段及权限边界进行非作者复核。D0-10A 即使获批，也只允许实现和合成测试，不允许访问 ChatGPT 页面。

## 5. 分级重新授权

### D0-10B：一次被动哨兵基线

D0-10B 必须另行创建并由 PO 明确批准。它只允许在新的非敏感 S1 页面生命周期中执行一次被动基线：确认 S1 形状、安装哨兵、在固定短窗口内观察、输出固定归因摘要并立即销毁。禁止滚动、高亮和其他可见页面动作。最终授权必须绑定确切观察窗口和总 deadline。

D0-10B 的 clean-baseline 成功不变量必须同时满足：`runOrdinal=1`、`phase=final-check`、`trigger=none`、`actionStarted=false`、无错误码，并且输出符合固定 schema。下列任一条件立即熔断并关闭额度：不满足任一成功不变量、`trigger=unknown` 或其他非 `none` 值、页面生命周期变化、输出越界、版本或哈希不一致、实现文件变脏。D0-10B 通过后只证明哨兵基线在该窗口内稳定，不证明定位能力。

### D0-10C：一次定位动作

只有 D0-10B 满足上述 clean-baseline 成功不变量并经 TL、GDE、QSR 验收通过后，才可准备 D0-10C。任何 error、非 `none` trigger、`unknown` 或生命周期变化均禁止准备或批准 D0-10C。D0-10C 必须重新绑定 probe/schema/policy 版本、实现与测试 SHA-256、测试结果、动作参数、清理 watchdog 和一条 R01 额度，并再次取得 PO 明确批准。

D0-10C 不预授权第二次运行；任何失败立即熔断。若仍需第二次观察，必须在首轮证据复核后另建授权。

## 6. 权限与失效边界

- D0-09B 永久保持关闭；D0-10 系列不得继承其额度。
- 不新增 host、storage、network、clipboard、debugger 权限，不持久化诊断，不启用遥测或远程 LLM。
- 批准后至运行前发生刷新、切页、切换标签页、新消息、流式状态、页面结构变化，或探针/测试文件变化，均使对应运行批准失效。
- 所有真实页面输出必须先通过敏感字段检查再进入项目证据；原始 Console 历史和页面内容不得提交。

## 7. 当前结论

**D0-10A 方案已准备但尚未获 PO 批准。当前只完成文档级归因；没有修改探针代码，没有运行 ChatGPT 页面，也没有产生 D0-10B 或 D0-10C 额度。**
