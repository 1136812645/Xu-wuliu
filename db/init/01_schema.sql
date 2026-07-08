CREATE DATABASE IF NOT EXISTS waybill_admin DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE waybill_admin;

CREATE TABLE IF NOT EXISTS shipper (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  contact_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_shipper_phone (phone)
);

CREATE TABLE IF NOT EXISTS carrier (
  id VARCHAR(64) PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  contact_name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_carrier_phone (phone)
);

CREATE TABLE IF NOT EXISTS driver (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  license_no VARCHAR(64) NOT NULL,
  license_expiry DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_driver_license_no (license_no),
  KEY idx_driver_phone (phone)
);

CREATE TABLE IF NOT EXISTS vehicle (
  id VARCHAR(64) PRIMARY KEY,
  plate_no VARCHAR(32) NOT NULL,
  truck_type ENUM('4.2M', '6.8M', '9.6M', '17.5M') NOT NULL,
  max_weight_kg DECIMAL(18,2) NOT NULL,
  max_volume_m3 DECIMAL(18,2) NOT NULL,
  road_permit_expiry DATETIME NULL,
  assigned_driver_id VARCHAR(64) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_vehicle_plate_no (plate_no),
  KEY idx_vehicle_driver (assigned_driver_id)
);

CREATE TABLE IF NOT EXISTS pricing_rule (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  shipper_id VARCHAR(64) NOT NULL,
  truck_type ENUM('4.2M', '6.8M', '9.6M', '17.5M') NOT NULL,
  min_mileage_km DECIMAL(18,2) NOT NULL,
  max_mileage_km DECIMAL(18,2) NOT NULL,
  unit_price_per_km DECIMAL(18,2) NOT NULL,
  loading_fee DECIMAL(18,2) NOT NULL,
  insurance_rate DECIMAL(10,4) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_pricing_rule_lookup (shipper_id, truck_type, min_mileage_km, max_mileage_km)
);

CREATE TABLE IF NOT EXISTS settlement_adjustment_rule (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  category ENUM('LOADING', 'DEDUCTION') NOT NULL,
  mode ENUM('FIXED', 'LINE_HAUL_RATE') NOT NULL,
  value DECIMAL(18,4) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  shipper_id VARCHAR(64) NULL,
  truck_type ENUM('4.2M', '6.8M', '9.6M', '17.5M') NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_settlement_adjustment_code (code),
  KEY idx_settlement_adjustment_scope (shipper_id, truck_type, enabled)
);

CREATE TABLE IF NOT EXISTS waybill_route_config (
  route_month CHAR(6) NOT NULL,
  shard_count INT NOT NULL,
  physical_table_prefix VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (route_month)
);

CREATE TABLE IF NOT EXISTS waybill_202607_0 (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  waybill_no VARCHAR(64) NOT NULL,
  shipper_id VARCHAR(64) NOT NULL,
  carrier_id VARCHAR(64) NOT NULL,
  vehicle_id VARCHAR(64) NOT NULL,
  mileage_km DECIMAL(18,2) NOT NULL,
  weight_kg DECIMAL(18,2) NOT NULL,
  volume_m3 DECIMAL(18,2) NOT NULL,
  goods_name VARCHAR(255) NOT NULL,
  status ENUM('DRAFT', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED', 'POD_UPLOADED') NOT NULL,
  total_amount DECIMAL(18,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  signed_at DATETIME NULL,
  pod_uploaded_at DATETIME NULL,
  UNIQUE KEY uk_waybill_202607_0_no (waybill_no),
  KEY idx_waybill_202607_0_shipper_time (shipper_id, created_at),
  KEY idx_waybill_202607_0_carrier_time (carrier_id, created_at),
  KEY idx_waybill_202607_0_status_time (status, created_at),
  KEY idx_waybill_202607_0_time_id (created_at, id),
  KEY idx_waybill_202607_0_shipper_time_id (shipper_id, created_at, id),
  KEY idx_waybill_202607_0_carrier_time_id (carrier_id, created_at, id),
  KEY idx_waybill_202607_0_vehicle_status_time (vehicle_id, status, created_at)
);

CREATE TABLE IF NOT EXISTS waybill_202607_1 LIKE waybill_202607_0;
CREATE TABLE IF NOT EXISTS waybill_202607_2 LIKE waybill_202607_0;
CREATE TABLE IF NOT EXISTS waybill_202607_3 LIKE waybill_202607_0;

CREATE TABLE IF NOT EXISTS waybill_fee_detail (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  waybill_no VARCHAR(64) NOT NULL,
  fee_type ENUM('LINE_HAUL', 'LOADING', 'INSURANCE', 'SUBSIDY', 'DEDUCTION') NOT NULL,
  fee_label VARCHAR(128) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  formula_snapshot VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_waybill_fee_detail_no (waybill_no),
  KEY idx_waybill_fee_detail_no_type (waybill_no, fee_type),
  KEY idx_waybill_fee_detail_type_time (fee_type, created_at)
);

CREATE TABLE IF NOT EXISTS pod_receipt (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  waybill_no VARCHAR(64) NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  uploaded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pod_receipt_waybill_no (waybill_no),
  KEY idx_pod_receipt_uploaded_at (uploaded_at)
);

CREATE TABLE IF NOT EXISTS waybill_operation_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  waybill_no VARCHAR(64) NOT NULL,
  operation_type ENUM('CREATE', 'SIGN', 'UPLOAD_POD') NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  operator_id VARCHAR(64) NULL,
  operation_result JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_waybill_operation (waybill_no, operation_type),
  UNIQUE KEY uk_waybill_idempotency_key (idempotency_key),
  KEY idx_waybill_operation_created (created_at)
);

CREATE TABLE IF NOT EXISTS waybill_report_daily (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_date DATE NOT NULL,
  shipper_id VARCHAR(64) NOT NULL,
  carrier_id VARCHAR(64) NOT NULL,
  waybill_count INT NOT NULL,
  revenue_amount DECIMAL(18,2) NOT NULL,
  carrier_cost_amount DECIMAL(18,2) NOT NULL,
  gross_profit_amount DECIMAL(18,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_waybill_report_daily (report_date, shipper_id, carrier_id),
  KEY idx_waybill_report_daily_carrier_date (carrier_id, report_date),
  KEY idx_waybill_report_daily_shipper_date (shipper_id, report_date),
  KEY idx_waybill_report_daily_date (report_date)
);

CREATE TABLE IF NOT EXISTS inbox_event (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(64) NOT NULL,
  event_type ENUM('WAYBILL_STATUS_CHANGED') NOT NULL,
  business_key VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  consume_status ENUM('NEW', 'RETRYING', 'CONSUMED', 'FAILED', 'DEAD_LETTER') NOT NULL DEFAULT 'NEW',
  retry_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_inbox_event_id (event_id),
  KEY idx_inbox_status_time (consume_status, created_at)
);

CREATE TABLE IF NOT EXISTS outbox_event (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_id VARCHAR(64) NOT NULL,
  event_type ENUM('WAYBILL_STATUS_CHANGED') NOT NULL,
  business_key VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  publish_status ENUM('NEW', 'PUBLISHED', 'FAILED', 'DEAD_LETTER') NOT NULL DEFAULT 'NEW',
  retry_count INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_outbox_event_id (event_id),
  KEY idx_outbox_status_time (publish_status, created_at)
);

CREATE TABLE IF NOT EXISTS auth_user (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(191) NOT NULL,
  name VARCHAR(128) NOT NULL,
  role ENUM('ADMIN', 'SHIPPER', 'CARRIER') NOT NULL DEFAULT 'SHIPPER',
  password_hash VARCHAR(255) NULL,
  google_sub VARCHAR(128) NULL,
  picture_url VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NULL,
  UNIQUE KEY uk_auth_user_email (email),
  UNIQUE KEY uk_auth_user_google_sub (google_sub),
  KEY idx_auth_user_role (role)
);
