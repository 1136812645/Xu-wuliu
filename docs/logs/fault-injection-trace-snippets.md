# Fault Injection Trace Snippets

Date: 2026-07-07

## 1) MQ disconnected baseline

GET /api/mq/status:

- connected = false
- consumerStarted = false
- stats.publishFailed = 3 (baseline)

## 2) Dirty data injection: duplicate sign record

SQL attempt:

INSERT INTO waybill_operation_log (waybill_no, operation_type, idempotency_key, operation_result)
VALUES ('WB999613635','SIGN','manual-dup-sign-... ', JSON_OBJECT('status','SIGNED'));

DB feedback:

ERROR 1062 (23000): Duplicate entry 'WB999613635-SIGN' for key 'waybill_operation_log.uk_waybill_operation'

Meaning:

- DB unique constraint blocked duplicate sign operation by business key.

## 3) Dirty data injection: corrupt fee amount

Before:

SELECT id, amount FROM waybill_fee_detail WHERE waybill_no='WB999613635' AND fee_type='LINE_HAUL' LIMIT 1;

Result:

- id = 50016
- amount = 98.40

Injected corruption:

UPDATE waybill_fee_detail SET amount = 10097.40 WHERE id = 50016;

Mismatch locate SQL result:

- waybill_no = WB999613635
- waybill_total = 279.58
- fee_total = 10278.58
- delta = 9999.00

Fix:

UPDATE waybill_fee_detail SET amount = 98.40 WHERE id = 50016;

Recheck:

- mismatch query returns empty (fixed).

## 4) MQ fault injection and locate illegal payload

Create while MQ disconnected:

- waybill_no = WB002647519
- API still returns created (business continuity)

Outbox summary:

- NEW = 1
- FAILED = 13

Inject illegal outbox payload:

INSERT INTO outbox_event (... payload=JSON_OBJECT('foo','bar'), publish_status='NEW');

Locate SQL result:

- event_id = manual-illegal-b398d2e3da2949dcbf07a562d4a1e5e9
- payload_event_id = NULL
- payload_waybill_no = NULL
- payload_operation = NULL

Repair:

UPDATE outbox_event
SET payload = JSON_OBJECT('eventId','manual-illegal-...','eventType','WAYBILL_STATUS_CHANGED','occurredAt',NOW(),'waybillId','WB002647519','waybillNo','WB002647519','status','ASSIGNED','operation','CREATE','shardTable','waybill_202607_1'),
    publish_status='NEW',
    retry_count=0
WHERE event_id='manual-illegal-b398d2e3da2949dcbf07a562d4a1e5e9';

Repair verify:

- payload_event_id/waybill_no/operation all non-null.

## 5) App log evidence snippets

From .tmp/api-db.err.log:

- [MQ] event persisted to outbox for waybill=WB999613635
- [MQ] event persisted to outbox for waybill=WB002647519

From .tmp/api-db.out.log:

- waybill.created for WB999613635, WB002647519
- waybill.signed for WB999613635
- request.received path /api/mq/outbox/flush

---

## 6) 2026-07-08 one-click drill snippets

Command:

```bash
node scripts/verify-fault-bug-mq-drill.mjs
```

Output highlights:

- `mqBaseline.connected=false`（队列不可用基线成立）
- `duplicateSignInjection.duplicateError.code=ER_DUP_ENTRY`
- `feeCorruptionAndRepair.mismatchCountAfterCorrupt=1`
- `feeCorruptionAndRepair.mismatchCountAfterRepair=0`
- `mqIllegalPayloadRepairAndReplay.illegalCountAfterInject=1`
- `mqIllegalPayloadRepairAndReplay.illegalCountAfterRepair=0`

Meaning:

- 脏数据可被系统化诊断接口识别并给出原因；
- SQL 修复后故障计数回落为 0；
- MQ 非法消息可被检测、订正并进入可重放流程。
