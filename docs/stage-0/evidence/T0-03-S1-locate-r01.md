# T0-03 S1 定位摘要 R01 失败证据

## 运行绑定

- 授权：`D0-09B`
- 运行编号：`T0-03-S1-LOCATE-R01`
- 页面范围：原 S1 专用、非敏感、可丢弃的 ChatGPT 合成会话
- 探针：`0.1.0` / schema `1` / policy `locate-summary-0.1`
- 实现 SHA-256：`DE6009330A133C0A8DBFDD65241190E7E9B62664BDBF4645D414153FECF5BBD9`
- 测试：定位 `18/18 pass`；Stage 0 全套 `31/31 pass`

## 脱敏结果

```json
{
  "schemaVersion": "1",
  "probeVersion": "0.1.0",
  "policyVersion": "locate-summary-0.1",
  "capturedAt": "2026-09-09T15:51:02.114Z",
  "status": "error",
  "errorCodes": ["CONVERSATION_CHANGED"],
  "page": {
    "surface": "unknown",
    "hostAllowed": false,
    "pathKind": "unknown",
    "mainRegionFound": false
  },
  "summary": {
    "messageCount": 0,
    "userCount": 0,
    "assistantCount": 0,
    "targetOrdinal": 4,
    "targetRole": "assistant",
    "targetCount": 0,
    "scrollAttempted": false,
    "scrollConfirmed": false,
    "focusConfirmed": false,
    "highlightApplied": false,
    "highlightCleared": false,
    "valueExposure": "none"
  },
  "limitations": []
}
```

## 清理与判定

- 操作人随后调用 `AICMLocateSummaryProbe.dispose()`；浏览器返回 `ReferenceError`，表示全局探针对象已不存在，与探针熔断时自动销毁的实现一致。未重新加载探针、未重试 R01、未执行 R02。
- `CONVERSATION_CHANGED` 只证明探针检测到会话生命周期变化；本次没有形成目标定位成功、稳定 ID、locator 或地图双向链路证据。
- 按 D0-09B 规则，本次 R01 失败后剩余额度全部作废；R02 不得执行。
- 本记录只保留固定白名单字段和抽象清理状态，不含正文、属性原值、真实 ID、URL、DOM、账号信息、Cookie、令牌或网络数据。

## 后续

若仍需验证 T0-03，必须针对新的页面生命周期重新创建 D0-09B（或新的等价授权），重新绑定探针/测试哈希并再次取得 GDE、QSR 与 PO 批准；不得复用本次额度。
