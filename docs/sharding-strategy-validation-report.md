# 运单分库分表分片策略与扩容方案验收报告（2026-07-06）

## 验收标准

1. 物理存在多张运单分表，分片路由逻辑代码合理；
2. 跨分片查询有说明；
3. 设计文档包含分片扩容、数据迁移方案。

## 1. 分表与路由验证

### 1.1 物理分表（DDL）

在数据库初始化脚本中已定义多张物理分表：

- waybill_202607_0
- waybill_202607_1
- waybill_202607_2
- waybill_202607_3

证据文件：db/init/01_schema.sql。

### 1.2 路由逻辑

代码通过 month + hash + shardCount 计算目标表：

- resolveShardTable(waybillNo, createdAt, shardCount)
- routeTable(...) + getShardCount(month)
- shardCount 从 waybill_route_config 动态读取

证据文件：

- apps/api/src/logic.ts
- apps/api/src/waybill-repository.ts

### 1.3 运行样例（4分片 vs 8分片）

执行 tsx 脚本得到：

- WB00000004: shard4 -> waybill_202607_0, shard8 -> waybill_202607_4
- WB00000005: shard4 -> waybill_202607_1, shard8 -> waybill_202607_5
- WB00000006: shard4 -> waybill_202607_2, shard8 -> waybill_202607_6

说明：扩容后路由可自然分散到新增分片，策略合理。

## 2. 跨分片查询说明与实现

### 2.1 文档说明

设计文档已说明跨分片查询策略：

- 报表优先聚合表
- 明细按运单号路由
- 分页按时间范围缩小命中范围

证据文件：docs/solution.md 第 5.5 节。

### 2.2 代码实现

listRecentWaybillsFromDb 会按当月分片清单拼接 UNION ALL 并统一排序分页。

证据文件：apps/api/src/waybill-repository.ts。

## 3. 扩容与迁移方案

文档已补充分片扩容与迁移方案：

- 扩容准备（创建新分片、更新 route_config）
- 新月切换与当月在线扩容两种策略
- 在线扩容步骤（双写、回填、校验、切读）
- 回滚方案（route_count 回退 + 日志补偿）

证据文件：docs/solution.md 第 5.5 节新增内容。

## 最终结论

- 验收标准 1：通过
- 验收标准 2：通过
- 验收标准 3：通过
