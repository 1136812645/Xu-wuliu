USE waybill_admin;

INSERT INTO pricing_rule (shipper_id, truck_type, min_mileage_km, max_mileage_km, unit_price_per_km, loading_fee, insurance_rate)
VALUES
  ('shipper-2', '9.6M', 0, 300, 8.10, 170.00, 0.0110),
  ('shipper-2', '9.6M', 301, 2000, 7.50, 170.00, 0.0110)
ON DUPLICATE KEY UPDATE
  unit_price_per_km = VALUES(unit_price_per_km),
  loading_fee = VALUES(loading_fee),
  insurance_rate = VALUES(insurance_rate);

SELECT shipper_id, truck_type, min_mileage_km, max_mileage_km, unit_price_per_km
FROM pricing_rule
WHERE shipper_id = 'shipper-2'
ORDER BY truck_type, min_mileage_km;
