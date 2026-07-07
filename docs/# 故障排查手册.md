# 故障排查手册

## 0. 日志留存约定

- 运行日志路径：`apps/api/logs/api-YYYY-MM-DD.log`
- 日志格式：JSON line（包含 ts/level/message/context）
- 常用筛选关键字：`waybill.created`、`waybill.signed`、`waybill.pod_uploaded`、`pricing_rules.reloaded`、`mq.consume_error`

建议命令：

```bash
rg "waybill.created|waybill.signed|pricing_rules.reloaded|mq.consume_error" logs/*.log

# 或
rg "waybill.created|waybill.signed|pricing_rules.reloaded|mq.consume_error" apps/api/logs/*.log
```

## 1. 重复签收

### 复现步骤

1. 对同一运单连续调用两次签收接口。
2. 第二次调用携带相同或不同的幂等键。

### 查看日志

- 应用日志：检索关键字 SIGN、idempotency-key、waybillNo
- 幂等记录：检查 Redis idem:key 或 waybill_operation_log

### 定位思路

1. 确认请求是否命中幂等键。
2. 确认数据库是否存在唯一约束 waybill_no + operation_type。
3. 若已写入状态，检查是否重复消费了 MQ 状态消息。

### 修复方案

1. 补齐幂等键存储。
2. 补齐唯一索引兜底。
3. 对 MQ 消费增加 eventId 去重。

## 2. 并发重复开单

### 复现步骤

1. 同一车辆、同一货源在高并发下同时开单。
2. 观察是否出现多张运单占用同一车辆。

### 查看日志

- 应用日志：create-waybill、vehicleId、lock-acquire、lock-release
- Redis：lock:create-waybill:{shipperId}:{vehicleId}

### 定位思路

1. 检查分布式锁是否成功获取。
2. 检查锁超时时间是否过短导致提前释放。
3. 检查数据库唯一约束是否兜底失败。

### 修复方案

1. 使用 Redis SET NX PX 或 Redisson 锁。
2. 增加锁续期与 finally 释放。
3. 使用事务确保占车与建单原子性。

## 3. 运费计算错误

### 复现步骤

1. 构造阶梯单价边界里程，例如 300km、301km。
2. 叠加补贴、扣款、保险费。

### 查看日志

- fee-calc 日志：shipperId、truckType、mileageKm、matchedRule、feeBreakdown

### 定位思路

1. 检查是否命中正确的 pricing_rule。
2. 检查是否对扣款和负数补贴重复取负。
3. 检查金额字段是否使用 decimal 而非 varchar。

### 修复方案

1. 调整阶梯规则边界。
2. 固化费用快照入 waybill_fee_detail。
3. 为边界场景补齐单元测试。

## 4. MQ 异常消息

### 复现步骤

1. 发送缺少业务键的非法消息。
2. 关闭消费者或队列后重新发送。

### 查看日志

- mq-producer 日志：eventId、exchange、routingKey
- mq-consumer 日志：eventId、retryCount、errorMessage
- dead-letter 日志：eventId、payload

### 处理闭环

1. 查明消息是否进入 outbox。
2. 查明是否发布成功到交换机。
3. 查明消费失败次数与最终落点。
4. 修复业务后执行消息重发。
