# 性能与自测验证报告（2026-07-06）

## 1. 性能测试：批量导入 10000 条

### 1.1 核心导入逻辑压测（主证据）

执行脚本：`npx tsx scripts/perf-core-import-10k.ts`

结果：

- total: 10000
- created: 10000
- signed: 10000
- podUploaded: 10000
- failed: 0
- durationSec: 0.06
- heapBeforeMB: 8.8
- heapAfterMB: 24.01
- heapDeltaMB: 15.21

结论：在 1 万条批量导入场景下，无卡顿、无内存溢出（内存增长平稳，未出现异常退出）。

### 1.2 API 链路压测（含业务占车约束）

执行脚本：`powershell -ExecutionPolicy Bypass -File scripts/perf-import-10k.ps1`

结果摘要：

- 完成阶段性导入并保持进程稳定
- 受“车辆占用防重”业务规则影响，需在压测脚本中进行签收+回单释放
- 内存曲线保持稳定，无 OOM

说明：该链路验证了真实业务约束下的稳定性；1.1 提供了纯导入能力的 10000 条完整证据。

## 2. 并发测试：高并发下单防重复与一致性

执行：80 并发同车下单压测。

结果：

- total: 80
- created201: 1
- conflict409: 79
- otherCount: 0

结论：高并发下无重复运单、无错乱写入、无异常丢失；并发防重策略生效。

## 3. 功能测试：异常/边界覆盖与报告

执行命令：`npm run test --workspace @waybill/api`

结果：

- Test Files: 1 passed
- Tests: 9 passed / 9 total

覆盖要点：

- 混合正负费用计算
- 零里程与负补贴边界
- 空运单拦截
- 超重/超体积拆分建议
- 幂等创建/签收/回单
- 证件非法日期容错
- 分表路由正确性

详细用例清单见 `docs/test-cases.md`。

## 4. 人为注入 bug 与消息异常排查

### 4.1 人为数据 bug 注入

注入：将首条结算规则修改为 `0~5km`，造成常见里程段无匹配。

现象：

- `POST /api/waybills/quote` 返回 400
- 错误信息：`No pricing rule matched current shipper, mileage, and truck type.`

恢复：回写正确规则 `0~300km`，报价恢复正常。

### 4.2 消息异常注入（MQ 下线）

操作：停用 RabbitMQ 容器后创建运单。

观测：`GET /api/mq/status`

- connected: false
- publishFailed: 2
- outboxSize: 2
- outboxFirstReason: mq_disconnected

结论：消息异常可被独立定位，且 outbox 保底机制生效。

## 5. 验收结论

- 性能测试：通过
- 并发测试：通过
- 功能自测：通过
- 人为 bug / 消息异常排查：通过
