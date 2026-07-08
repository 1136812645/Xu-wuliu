# 数据 Bug 与 MQ 异常定位排查验收报告

日期: 2026-07-07

## 1. 验收目标

按要求完成以下模拟故障并输出完整处理流程：

1. 人为构造脏数据:
- 手动插入重复签收记录
- 手动篡改运费金额
- 系统/数据库能够给出故障原因

2. 人为构造 MQ 故障:
- 队列不可用（本次环境表现为 MQ 连接断开）
- 注入非法消息

3. 输出完整排查过程:
- 日志定位
- SQL 修复
- 消息重发
- 数据订正方案

## 2. 环境与基线 

- API: http://127.0.0.1:3000
- DB: waybill_admin
- Redis shim: 6380
- MQ runtime baseline: connected=false, consumerStarted=false

说明:

- 本次环境中 MQ 服务不可达，等效于“关闭队列/队列不可用”场景。

## 3. 故障注入与排查过程

### 3.1 构造测试样本

1) 创建并签收测试运单:
- waybill_no = WB999613635
- sign 后状态 = SIGNED

### 3.2 数据 Bug 注入 A: 重复签收记录

注入 SQL:

INSERT INTO waybill_operation_log (waybill_no, operation_type, idempotency_key, operation_result)
VALUES ('WB999613635','SIGN','manual-dup-sign-...', JSON_OBJECT('status','SIGNED'));

系统提示/数据库反馈:

ERROR 1062 (23000): Duplicate entry 'WB999613635-SIGN' for key 'waybill_operation_log.uk_waybill_operation'

定位结论:

- 重复签收被数据库唯一键直接拦截，故障原因明确（业务键重复）。

### 3.3 数据 Bug 注入 B: 错误运费金额

1) 注入前读取:
- fee row id = 50016
- LINE_HAUL amount = 98.40

2) 人为篡改:

UPDATE waybill_fee_detail SET amount = 10097.40 WHERE id = 50016;

3) 定位 SQL（总额对账）:
- waybill_total = 279.58
- fee_total = 10278.58
- delta = 9999.00

定位结论:

- 运费明细与运单总额明显不一致，属于可检测的数据污染。

4) SQL 修复:

UPDATE waybill_fee_detail SET amount = 98.40 WHERE id = 50016;

5) 修复后复核:
- 对账差异查询返回空，恢复一致。

### 3.4 MQ 故障注入 A: 队列不可用（MQ 断连）

1) 断连状态下创建运单:
- waybill_no = WB002647519
- 业务创建成功（不中断）

2) outbox 状态核对:
- NEW = 1
- FAILED = 13

定位结论:

- 当 MQ 不可用时，事件进入 outbox，业务链路保持可用，未出现系统崩溃。

### 3.5 MQ 故障注入 B: 非法消息

1) 注入非法 payload:

INSERT INTO outbox_event (... payload=JSON_OBJECT('foo','bar'), publish_status='NEW');

2) 定位 SQL（检测缺字段）命中:
- payload_event_id = NULL
- payload_waybill_no = NULL
- payload_operation = NULL

3) 数据订正:
- 将非法 payload 订正为完整事件结构（eventId/eventType/waybillNo/operation/shardTable 等）
- publish_status 设回 NEW

4) 订正复核:
- payload 必填字段已齐全

### 3.6 消息重发流程

1) 调用重发接口:
- POST /api/mq/outbox/flush

2) 本次环境结果:
- sent = 0
- MQ 仍断连，故未真正发送到队列

3) 标准恢复步骤:
- 恢复 RabbitMQ 连通
- 再次执行 outbox flush
- 复核 outbox_event 中 NEW/FAILED 数量下降、PUBLISHED 增加

## 4. 日志定位证据

- 应用日志路径:
  - apps/api/logs/api-2026-07-07.log
  - .tmp/api-db.out.log
  - .tmp/api-db.err.log

关键日志事实:

- waybill.created / waybill.signed 记录了业务操作主链路。
- .tmp/api-db.err.log 存在多条:
  - [MQ] event persisted to outbox for waybill=...

对应结论:

- MQ 失败后事件已落 outbox，可追踪、可补偿。

## 5. 完整处理流程（标准作业）

1) 发现阶段（监控/告警）
- 观察 outbox_event 中 NEW/FAILED 增长
- 观察接口与日志中 MQ 异常提示

2) 定位阶段（SQL + 日志）
- 对账 SQL 检查 waybill_total 与 fee_detail 总额差异
- 非法 payload SQL 检查 outbox payload 必填字段缺失
- 检查 waybill_operation_log 唯一键冲突信息

3) 修复阶段（数据订正）
- 按业务真值修正 fee_detail 脏数据
- 将非法 outbox payload 订正为标准事件结构

4) 重发阶段（消息补偿）
- MQ 恢复后执行 /api/mq/outbox/flush
- 持续观察 publish_status 转换

5) 验证阶段（闭环）
- 再跑对账 SQL，确认差异归零
- 检查 outbox 残留与业务结果一致
- 记录证据并归档

## 6. 结论

本次已完成“数据 bug + MQ 异常”模拟与全流程排查，具备以下能力:

- 可人工注入并检测重复签收与错误运费
- 可在 MQ 队列不可用时保证业务连续与 outbox 保底
- 可识别并订正非法消息 payload
- 可输出日志定位、SQL 修复、消息重发、数据订正完整处理流程

附录:

- 证据摘录: docs/logs/fault-injection-trace-snippets.md
- 可复用 SQL: scripts/sql/fault-repair-playbook.sql

---

## 补充验收（2026-07-08）

### A. 本轮代码完善

1. 新增系统化故障诊断接口（系统可直接提示故障原因）:
  - `GET /api/faults/diagnostics`（需 `report:view` 权限）
  - 输出两类故障原因：
    - `feeMismatch`：`waybill.total_amount` 与 `SUM(waybill_fee_detail.amount)` 不一致
    - `illegalOutboxPayload`：`eventId/waybillNo/operation` 缺失
  - 文件：`apps/api/src/index.ts`

2. 新增一键故障演练脚本：
  - `scripts/verify-fault-bug-mq-drill.mjs`
  - 覆盖流程：
    - 脏数据注入（重复签收、错误金额）
    - 日志/诊断定位
    - SQL 修复与数据订正
    - MQ 非法消息注入与订正
    - outbox 重发

### B. 本轮演练执行

执行命令：

```bash
BASE_URL=http://127.0.0.1:3100 \
DB_HOST=127.0.0.1 DB_PORT=13306 DB_USER=root DB_PASSWORD=root DB_NAME=waybill_admin \
VEHICLE_ID=vehicle-3 SHIPPER_ID=shipper-1 CARRIER_ID=carrier-1 \
node scripts/verify-fault-bug-mq-drill.mjs
```

关键结果（节选）：

1. 重复签收脏数据注入：
  - DB 返回：`ER_DUP_ENTRY`
  - message：`Duplicate entry 'WB009469849-SIGN' for key 'waybill_operation_log.uk_waybill_operation'`

2. 错误运费金额注入：
  - 注入后：`mismatchCountAfterCorrupt = 1`
  - 修复后：`mismatchCountAfterRepair = 0`

3. MQ 队列不可用模拟：
  - `connectedBefore = false`
  - 创建运单仍成功（业务不中断）
  - `publishFailedAfterCreate` 上升（故障可观测）

4. MQ 非法消息注入与订正：
  - 注入后：`illegalCountAfterInject = 1`
  - 订正后：`illegalCountAfterRepair = 0`
  - 执行 `POST /api/mq/outbox/flush` 获取重放结果

### C. 本轮完整处理流程（可复用）

1. 注入故障（重复签收 / 错误金额 / 非法消息）
2. 调用 `/api/faults/diagnostics` 获取原因与样例
3. 执行 SQL 修复（金额恢复、payload 字段补齐）
4. 调用 `/api/mq/outbox/flush` 进行消息重放
5. 再次调用 `/api/faults/diagnostics` 复核故障归零

### D. 本轮结论

- 满足“手工构造脏数据后系统可提示故障原因”要求。
- 满足“构造 MQ 故障（队列不可用 + 非法消息）并输出完整处理流程”要求。
- 已形成可重复执行的标准化流程：日志定位、SQL 修复、消息重发、数据订正。
