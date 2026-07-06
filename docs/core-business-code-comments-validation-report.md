# 核心业务代码注释验收报告（2026-07-06）

## 验收标准

打开运费计算、运单状态流转、MQ 消费、分表路由、幂等拦截核心类：

1. 方法头注释说明功能、入参、输出
2. 复杂 if / 正负金额 / 分片逻辑行内注释
3. MQ 重复消费、并发锁逻辑有说明注释

判定：核心业务无注释视为不达标。

## 结论

- 标准 1：通过
- 标准 2：通过
- 标准 3：通过
- 最终判定：通过

## 证据

### 1) 方法头注释（功能/入参/输出）

已补充并落地于核心函数：

- 分表路由：`resolveShardTable`
- 运费计算：`calculateFees`
- 运单状态流转：`transitionWaybill`
- MQ 关键链路：`tryRecordInboxEvent`、`handleMessage`、`publishWaybillEvent`、`flushOutbox`
- 分库分表仓储：`routeTable`、`createWaybillInDb`、`listRecentWaybillsFromDb`、`transitionWaybillInDb`
- 并发锁：`acquireDistributedLock`

对应文件：
- apps/api/src/logic.ts
- apps/api/src/mq.ts
- apps/api/src/waybill-repository.ts
- apps/api/src/redis-lock.ts

### 2) 复杂逻辑行内注释

已补充关键行内说明：

- 正负金额：扣款转负值参与总额汇总（DEDUCTION）
- 分片逻辑：相同 waybillNo 在相同 shardCount 下路由稳定
- MQ 重复消费：重复消息 ack 并跳过业务执行
- 锁语义：Redis NX+PX 保障单写入与自动过期防死锁
- 幂等拦截：HTTP 层 fast-path 直接返回已保存快照

### 3) MQ 重复消费与并发锁说明

- MQ：消费去重、重试、死信路径注释齐全
- 分布式锁：获取、等待、释放（Lua token 校验）说明齐全

## 回归结果

- `npm run check --workspace @waybill/api`：通过
- `npm run test --workspace @waybill/api`：通过（9/9）
