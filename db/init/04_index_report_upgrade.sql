USE waybill_admin;

ALTER TABLE waybill_202607_0
  ADD KEY idx_waybill_202607_0_time_id (created_at, id),
  ADD KEY idx_waybill_202607_0_shipper_time_id (shipper_id, created_at, id),
  ADD KEY idx_waybill_202607_0_carrier_time_id (carrier_id, created_at, id),
  ADD KEY idx_waybill_202607_0_vehicle_status_time (vehicle_id, status, created_at);

ALTER TABLE waybill_202607_1
  ADD KEY idx_waybill_202607_1_time_id (created_at, id),
  ADD KEY idx_waybill_202607_1_shipper_time_id (shipper_id, created_at, id),
  ADD KEY idx_waybill_202607_1_carrier_time_id (carrier_id, created_at, id),
  ADD KEY idx_waybill_202607_1_vehicle_status_time (vehicle_id, status, created_at);

ALTER TABLE waybill_202607_2
  ADD KEY idx_waybill_202607_2_time_id (created_at, id),
  ADD KEY idx_waybill_202607_2_shipper_time_id (shipper_id, created_at, id),
  ADD KEY idx_waybill_202607_2_carrier_time_id (carrier_id, created_at, id),
  ADD KEY idx_waybill_202607_2_vehicle_status_time (vehicle_id, status, created_at);

ALTER TABLE waybill_202607_3
  ADD KEY idx_waybill_202607_3_time_id (created_at, id),
  ADD KEY idx_waybill_202607_3_shipper_time_id (shipper_id, created_at, id),
  ADD KEY idx_waybill_202607_3_carrier_time_id (carrier_id, created_at, id),
  ADD KEY idx_waybill_202607_3_vehicle_status_time (vehicle_id, status, created_at);

ALTER TABLE waybill_fee_detail
  ADD KEY idx_waybill_fee_detail_no_type (waybill_no, fee_type),
  ADD KEY idx_waybill_fee_detail_type_time (fee_type, created_at);

ALTER TABLE pod_receipt
  ADD KEY idx_pod_receipt_uploaded_at (uploaded_at);

ALTER TABLE waybill_operation_log
  ADD KEY idx_waybill_operation_created (created_at);

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
