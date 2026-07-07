-- Fault Repair Playbook
-- Purpose: reusable SQL checks/fixes for dirty data and MQ outbox anomalies.

USE waybill_admin;

-- 1) Detect duplicate operation records by business key (waybill_no + operation_type).
SELECT waybill_no, operation_type, COUNT(*) AS cnt
FROM waybill_operation_log
GROUP BY waybill_no, operation_type
HAVING COUNT(*) > 1;

-- 2) Detect duplicate operation records by idempotency key.
SELECT idempotency_key, COUNT(*) AS cnt
FROM waybill_operation_log
GROUP BY idempotency_key
HAVING COUNT(*) > 1;

-- 3) Detect fee mismatch (sum(fee_detail) != waybill.total_amount) for all shards.
SELECT w.waybill_no,
       w.total_amount AS waybill_total,
       ROUND(SUM(f.amount), 2) AS fee_total,
       ROUND(SUM(f.amount) - w.total_amount, 2) AS delta
FROM (
  SELECT waybill_no, total_amount FROM waybill_202607_0
  UNION ALL
  SELECT waybill_no, total_amount FROM waybill_202607_1
  UNION ALL
  SELECT waybill_no, total_amount FROM waybill_202607_2
  UNION ALL
  SELECT waybill_no, total_amount FROM waybill_202607_3
) w
JOIN waybill_fee_detail f ON f.waybill_no = w.waybill_no
GROUP BY w.waybill_no, w.total_amount
HAVING ROUND(SUM(f.amount) - w.total_amount, 2) <> 0;

-- 4) Example: fix one corrupted fee row by id (replace values manually).
-- UPDATE waybill_fee_detail SET amount = 98.40 WHERE id = 50016;

-- 5) Detect illegal outbox payload (missing required fields).
SELECT event_id,
       business_key,
       JSON_UNQUOTE(JSON_EXTRACT(payload, '$.eventId')) AS payload_event_id,
       JSON_UNQUOTE(JSON_EXTRACT(payload, '$.waybillNo')) AS payload_waybill_no,
       JSON_UNQUOTE(JSON_EXTRACT(payload, '$.operation')) AS payload_operation,
       publish_status
FROM outbox_event
WHERE publish_status IN ('NEW', 'FAILED')
  AND (
    JSON_EXTRACT(payload, '$.eventId') IS NULL
    OR JSON_EXTRACT(payload, '$.waybillNo') IS NULL
    OR JSON_EXTRACT(payload, '$.operation') IS NULL
  );

-- 6) Example: repair one illegal outbox payload (replace placeholders manually).
-- UPDATE outbox_event
-- SET payload = JSON_OBJECT(
--   'eventId', 'manual-illegal-xxxx',
--   'eventType', 'WAYBILL_STATUS_CHANGED',
--   'occurredAt', NOW(),
--   'waybillId', 'WBxxxx',
--   'waybillNo', 'WBxxxx',
--   'status', 'ASSIGNED',
--   'operation', 'CREATE',
--   'shardTable', 'waybill_202607_1'
-- ),
-- publish_status = 'NEW',
-- retry_count = 0
-- WHERE event_id = 'manual-illegal-xxxx';

-- 7) Outbox status summary for replay tracking.
SELECT publish_status, COUNT(*) AS cnt
FROM outbox_event
GROUP BY publish_status
ORDER BY publish_status;
