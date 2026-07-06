# 数据表结构规范验收报告（2026-07-06）

## 验收项

- 验证点：区分数值、时间、枚举，禁止全 VARCHAR。
- 缺陷判定：
  1. 金额用 VARCHAR
  2. 日期存字符串
  3. 状态无枚举类型

## 验收结论

- 缺陷 1（金額用 VARCHAR）：未发现
- 缺陷 2（日期存字符串）：未发现
- 缺陷 3（状态无枚举类型）：未发现
- 综合结论：通过

## 证据明细

### 1) 数值字段类型规范（金额/里程/重量/体积）

以下关键业务数值字段均为 DECIMAL/INT，而非 VARCHAR：

- 车辆载重/容积：max_weight_kg DECIMAL(18,2), max_volume_m3 DECIMAL(18,2)
- 运价规则：min_mileage_km/max_mileage_km/unit_price_per_km/loading_fee/insurance_rate
- 运单核心：mileage_km/weight_kg/volume_m3/total_amount
- 费用明细：amount DECIMAL(18,2)
- 日报汇总：revenue_amount/carrier_cost_amount/gross_profit_amount

证据文件：db/init/01_schema.sql

### 2) 时间字段类型规范（日期时间）

以下字段均使用 DATETIME/DATE，而非字符串：

- created_at / updated_at（多表统一）
- license_expiry / road_permit_expiry
- signed_at / pod_uploaded_at
- uploaded_at
- report_date

证据文件：db/init/01_schema.sql

### 3) 状态字段枚举规范

以下状态类字段均使用 ENUM：

- waybill.status
- waybill_operation_log.operation_type
- inbox_event.consume_status
- outbox_event.publish_status
- event_type（inbox/outbox）
- truck_type（vehicle/pricing_rule）

证据文件：db/init/01_schema.sql

## 备注

- VARCHAR 主要用于业务标识与文本（如 id、code、phone、goods_name、formula_snapshot），符合建模预期。
- 本次检查范围聚焦表结构规范，不涉及业务语义正确性与索引性能评估。
