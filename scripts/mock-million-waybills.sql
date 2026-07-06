USE waybill_admin;

-- Seed 1,000,000 rows into waybill_202607_0 for pagination performance validation.
-- Requires MySQL 8+ (recursive CTE).

SET SESSION sql_log_bin = 0;
SET SESSION cte_max_recursion_depth = 1000000;
SET @base_time := '2026-07-01 00:00:00';

TRUNCATE TABLE waybill_202607_0;

INSERT INTO waybill_202607_0 (
  waybill_no, shipper_id, carrier_id, vehicle_id,
  mileage_km, weight_kg, volume_m3, goods_name,
  status, total_amount, created_at, signed_at, pod_uploaded_at
)
WITH RECURSIVE seq AS (
  SELECT 1 AS n
  UNION ALL
  SELECT n + 1 FROM seq WHERE n < 1000000
)
SELECT
  CONCAT('WB', LPAD(n, 12, '0')),
  IF(n % 2 = 0, 'shipper-1', 'shipper-2'),
  IF(n % 2 = 0, 'carrier-1', 'carrier-2'),
  IF(n % 2 = 0, 'vehicle-1', 'vehicle-2'),
  50 + (n % 500),
  100 + (n % 15000),
  1 + (n % 40),
  'bulk seed',
  ELT((n % 6) + 1, 'DRAFT', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED', 'POD_UPLOADED'),
  200 + (n % 10000),
  DATE_ADD(@base_time, INTERVAL (n % 250000) SECOND),
  NULL,
  NULL
FROM seq;

ANALYZE TABLE waybill_202607_0;

SELECT COUNT(*) AS total_rows FROM waybill_202607_0;

-- Optional: replicate into other shard tables (disabled by default)
-- TRUNCATE TABLE waybill_202607_1;
-- TRUNCATE TABLE waybill_202607_2;
-- TRUNCATE TABLE waybill_202607_3;
-- INSERT INTO waybill_202607_1 SELECT * FROM waybill_202607_0 WHERE id % 3 = 0;
-- INSERT INTO waybill_202607_2 SELECT * FROM waybill_202607_0 WHERE id % 3 = 1;
-- INSERT INTO waybill_202607_3 SELECT * FROM waybill_202607_0 WHERE id % 3 = 2;
