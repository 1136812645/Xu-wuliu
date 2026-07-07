# MQ 可靠投递、重复消费、死信队列验收报告（2026-07-06）

## 验收项

1. 消息不丢失、不重复执行业务
2. 存在死信队列，异常消息隔离
3. MQ 持久化、重试、死信配置在配置文件/代码中落地
4. 支持分布式部署

## 结论

- 验收项 1：通过
- 验收项 2：通过
- 验收项 3：通过
- 验收项 4：通过

## 证据明细

### 1) 消息不丢失、不重复执行业务

- 生产失败落库 outbox：MQ 不可用或发布失败时，事件写入 outbox_event（FAILED），后续可 flush 补偿发送。
  - 代码：apps/api/src/mq.ts（upsertOutboxEvent / pushOutbox / flushOutbox）
- 消费去重落库 inbox：通过 INSERT IGNORE + event_id 唯一键实现幂等消费，避免跨实例重复执行业务。
  - 代码：apps/api/src/mq.ts（tryRecordInboxEvent）
  - 表：db/init/01_schema.sql（inbox_event + uk_inbox_event_id）
- 消费状态可追溯：CONSUMED / RETRYING / DEAD_LETTER 状态回写 inbox_event。
  - 代码：apps/api/src/mq.ts（updateInboxStatus）

### 2) 死信队列与异常隔离

- 主队列配置了 x-dead-letter-exchange / x-dead-letter-routing-key。
- 重试预算耗尽（x-retry-count >= 3）后 nack 到 DLQ。
- DLQ 队列单独存在并持久化。

证据：
- 代码：apps/api/src/mq.ts
  - assertQueue(EVENT_QUEUE) 参数包含 dead-letter 路由
  - assertQueue(DLQ_QUEUE, { durable: true })
  - handleMessage 中重试上限后 nack(false,false)

### 3) 持久化、重试、死信配置落地

- 持久化：
  - exchange durable=true
  - queue durable=true
  - message deliveryMode=2
  - confirm publish + waitForConfirms
- 重试：
  - RETRY_QUEUE 带 x-message-ttl
  - TTL 到期通过 dead-letter 回流主交换机
  - 失败计数放在 headers.x-retry-count
- 配置落地：
  - 环境变量可覆盖交换机、队列、路由键、重试延迟（RABBITMQ_*）

证据：
- 代码：apps/api/src/mq.ts
- 文档：docs/solution.md（5.4 节已补充落地细节）

### 4) 分布式部署支持

- docker compose 包含双 API 实例 api-1 与 api-2，共享同一 RabbitMQ。
- 服务无状态消费：消费者启动统一订阅主队列。
- 去重依赖共享数据库 inbox_event 唯一键，跨实例生效。

证据：
- 配置：docker-compose.yml（api-1、api-2、rabbitmq）
- 代码：apps/api/src/mq.ts（tryRecordInboxEvent + inbox_event）

## 本轮验证执行

- 类型检查：npm run check --workspace @waybill/api（通过）
- 单元测试：npm run test --workspace @waybill/api（9/9 通过）

## 备注

- 本次增强将“进程内去重”提升为“数据库共享去重”，使重复消费控制在多实例/重启后仍可保持一致。
