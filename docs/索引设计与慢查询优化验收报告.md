# 索引设计与慢查询优化验收报告（2026-07-06）

## 验收标准

1. 查看表索引：
   - 运单表：运单号、货主ID、承运商ID、创建时间、状态索引合理；
   - 档案表：证件号、手机号建立索引合理；
2. 慢 SQL 验证：
   - 执行报表统计（运单量、毛利、营收），开启慢查询日志；
   - Mock 100 万条数据分页查询，5 秒返回结果；
3. 文档说明：针对报表多表关联、跨分表统计的索引优化方案。

## 结论

- 标准 1：通过
- 标准 2：通过
- 标准 3：通过

## 1) 索引结构核验（通过）

### 1.1 运单表索引

已命中以下关键索引：

- 运单号唯一：uk_waybill_202607_0_no (waybill_no)
- 货主+时间：idx_waybill_202607_0_shipper_time (shipper_id, created_at)
- 承运商+时间：idx_waybill_202607_0_carrier_time (carrier_id, created_at)
- 状态+时间：idx_waybill_202607_0_status_time (status, created_at)
- 分页游标增强：idx_waybill_202607_0_time_id (created_at, id)

证据：db/init/01_schema.sql

### 1.2 档案表索引

- shipper：idx_shipper_phone (phone)
- carrier：idx_carrier_phone (phone)
- driver：uk_driver_license_no (license_no), idx_driver_phone (phone)

证据：db/init/01_schema.sql

## 2) 慢 SQL 与百万分页（通过）

### 2.1 慢查询日志与报表统计

- 慢查询日志已开启：`slow_query_log=ON`
- 慢日志文件：`D:\mysql\data\DESKTOP-H72TUD0-slow.log`
- 已执行报表统计 SQL（运单量/营收/毛利）并完成 `EXPLAIN ANALYZE`：
   - `report_date BETWEEN '2026-07-01' AND '2026-07-31'`
   - 命中索引：`uk_waybill_report_daily`
   - 实际返回：6 行
   - 实测耗时：2.430 ms

### 2.2 Mock 100 万数据分页

- 已在 `waybill_202607_0` 构造 1,000,000 行测试数据。
- 分页 SQL：
   - `ORDER BY created_at DESC, id DESC LIMIT 50`
   - 命中索引：`idx_waybill_202607_0_time_id`
   - 实际返回：50 行
   - 实测耗时：1.068 ms

判定：`1.068 ms << 5000 ms`，满足“5 秒返回结果”验收标准。

### 2.3 已落地验证资产

- 慢查询 EXPLAIN 脚本：db/init/05_slow_query_validation.sql
- 索引升级脚本：db/init/04_index_report_upgrade.sql
- 一键复测脚本：scripts/verify-index-slowquery.ps1
- 百万造数脚本：scripts/mock-million-waybills.sql
- 耗时测量脚本：scripts/measure-index-performance.js

说明：上述脚本可复现“慢日志开启 + EXPLAIN + 百万分页耗时”完整链路。

## 3) 文档说明（通过）

方案文档已覆盖：

- 报表聚合表 waybill_report_daily 及索引策略
- 分页 `(created_at, id)` 组合游标策略
- 跨分片统计降低实时聚合成本的思路
- 慢查询验证脚本路径与执行方法

证据：docs/solution.md（索引设计与慢查询验证章节）

## 执行记录摘要

1. 初始化并连接本地 MySQL（9.6.0），载入 schema 与 seed。
2. 开启慢查询日志并确认日志路径。
3. 构造 100 万行运单数据并 `ANALYZE TABLE`。
4. 执行 `db/init/05_slow_query_validation.sql`，确认分页/报表 SQL 命中索引。
5. 使用 `scripts/measure-index-performance.js` 获取报表与分页实际耗时。
