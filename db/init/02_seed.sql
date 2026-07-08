USE waybill_admin;

INSERT INTO shipper (id, code, name, contact_name, phone)
VALUES
  ('shipper-1', 'SHP001', '华东家电', '王丽', '13800000001'),
  ('shipper-2', 'SHP002', 'Northwind Retail', 'John Smith', '13800000002')
ON DUPLICATE KEY UPDATE name = VALUES(name), contact_name = VALUES(contact_name), phone = VALUES(phone);

INSERT INTO carrier (id, code, name, contact_name, phone)
VALUES
  ('carrier-1', 'CAR001', '远达干线', '陈锋', '13900000001'),
  ('carrier-2', 'CAR002', 'Blue Lane Carrier', 'Mia Brown', '13900000002')
ON DUPLICATE KEY UPDATE name = VALUES(name), contact_name = VALUES(contact_name), phone = VALUES(phone);

INSERT INTO driver (id, name, phone, license_no, license_expiry)
VALUES
  ('driver-1', '李明', '13700000001', 'DL-2024-001', '2026-07-20 00:00:00'),
  ('driver-2', 'Grace Wilson', '13700000002', 'DL-2023-008', '2026-06-28 00:00:00')
ON DUPLICATE KEY UPDATE name = VALUES(name), phone = VALUES(phone), license_expiry = VALUES(license_expiry);

INSERT INTO vehicle (id, plate_no, truck_type, max_weight_kg, max_volume_m3, road_permit_expiry, assigned_driver_id)
VALUES
  ('vehicle-1', '沪A12345', '9.6M', 18000, 55, '2026-07-14 00:00:00', 'driver-1'),
  ('vehicle-2', '苏B99881', '6.8M', 10000, 32, NULL, 'driver-2'),
  ('vehicle-3', '浙C77889', '9.6M', 18000, 55, '2026-08-31 00:00:00', 'driver-1')
ON DUPLICATE KEY UPDATE truck_type = VALUES(truck_type), max_weight_kg = VALUES(max_weight_kg), max_volume_m3 = VALUES(max_volume_m3), assigned_driver_id = VALUES(assigned_driver_id);

INSERT INTO pricing_rule (shipper_id, truck_type, min_mileage_km, max_mileage_km, unit_price_per_km, loading_fee, insurance_rate)
VALUES
  ('shipper-1', '9.6M', 0, 300, 8.20, 180.00, 0.0120),
  ('shipper-1', '9.6M', 301, 2000, 7.60, 180.00, 0.0120),
  ('shipper-2', '6.8M', 0, 1500, 6.90, 120.00, 0.0100),
  ('shipper-2', '9.6M', 0, 300, 8.10, 170.00, 0.0110),
  ('shipper-2', '9.6M', 301, 2000, 7.50, 170.00, 0.0110)
ON DUPLICATE KEY UPDATE unit_price_per_km = VALUES(unit_price_per_km), loading_fee = VALUES(loading_fee), insurance_rate = VALUES(insurance_rate);

INSERT INTO waybill_route_config (route_month, shard_count, physical_table_prefix)
VALUES ('202607', 4, 'waybill_202607')
ON DUPLICATE KEY UPDATE shard_count = VALUES(shard_count), physical_table_prefix = VALUES(physical_table_prefix);

INSERT INTO auth_user (id, email, name, role, password_hash, google_sub, picture_url)
VALUES
  ('user-admin-seed', 'admin@example.com', 'Admin User', 'ADMIN', NULL, NULL, NULL),
  ('user-shipper-seed', 'shipper@example.com', 'Shipper User', 'SHIPPER', NULL, NULL, NULL),
  ('user-carrier-seed', 'carrier@example.com', 'Carrier User', 'CARRIER', NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  role = VALUES(role);
