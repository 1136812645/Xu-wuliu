USE waybill_admin;

-- 1) 分页查询（按时间倒序 + 游标id）应命中 idx_waybill_202607_0_time_id
EXPLAIN
SELECT waybill_no, shipper_id, carrier_id, status, total_amount, created_at
FROM waybill_202607_0
WHERE created_at <= '2026-12-31 23:59:59'
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- 2) 货主维度分页应命中 idx_waybill_202607_0_shipper_time_id
EXPLAIN
SELECT waybill_no, status, total_amount, created_at
FROM waybill_202607_0
WHERE shipper_id = 'shipper-1'
  AND created_at >= '2026-07-01 00:00:00'
  AND created_at < '2026-08-01 00:00:00'
ORDER BY created_at DESC, id DESC
LIMIT 50;

-- 3) 费用对账按运单号聚合应命中 idx_waybill_fee_detail_no_type
EXPLAIN
SELECT f.waybill_no,
       SUM(CASE WHEN f.fee_type = 'LINE_HAUL' THEN f.amount ELSE 0 END) AS line_haul_amount,
       SUM(CASE WHEN f.fee_type = 'INSURANCE' THEN f.amount ELSE 0 END) AS insurance_amount,
       SUM(f.amount) AS total_fee_amount
FROM waybill_fee_detail f
WHERE f.waybill_no = 'WB00000001'
GROUP BY f.waybill_no;

-- 4) 日报查询应命中 idx_waybill_report_daily_date / shipper_date / carrier_date
EXPLAIN
SELECT report_date, shipper_id, carrier_id, waybill_count, revenue_amount, gross_profit_amount
FROM waybill_report_daily
WHERE report_date BETWEEN '2026-07-01' AND '2026-07-31'
ORDER BY report_date DESC
LIMIT 31;
