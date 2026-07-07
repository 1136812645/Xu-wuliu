# 问题复盘与调试日志留存验收报告（2026-07-06）

## 验收目标

验证标准 4：问题复盘，具备 bug 排查过程、调试日志留存。

验收标准：

1. 系统日志文件检查
- 运行日志
- MQ 消费日志
- 异常报错日志

2. 随机生成一个典型 bug，形成闭环证据链
- 复现步骤
- 查看哪块日志
- 定位代码问题
- 修复方案
- 验证闭环

## 结论

- 标准 1（日志文件）: 通过
- 标准 2（典型 bug 闭环）: 通过
- 最终判定: 通过

## 证据清单

### A. 日志文件留存

1. 运行日志（系统请求与启动）
- 原始日志：apps/api/logs/api-2026-07-06.log
- 验收样本：docs/logs/api-2026-07-06.sample.log
- 提交留存：docs/logs/system-run-log-snippets.md
- 关键字段：ts / level / message / context
- 关键消息：service.started、request.received、waybill.created、waybill.signed

2. MQ 消费日志
- 原始日志：apps/api/logs/api-2026-07-06.log
- 提交留存：docs/logs/mq-error-log-snippets.md
- 关键消息：mq.consume_error
- 观测到非法消息被消费端识别并记录异常（重试期间连续出现）

3. 异常报错日志
- 原始日志：apps/api/logs/api-2026-07-06.log
- ERROR 样本：message=mq.consume_error, error=Invalid event payload.

### B. 典型 bug 复盘（重复签收）

#### B1. 复现步骤与步骤日志

- 复现记录（首次链路）：docs/logs/bug-replay-duplicate-sign.trace.log
- 验证记录（修复后链路）：docs/logs/bug-replay-duplicate-sign-fixed.trace.log
- 提交留存（合并片段）：docs/logs/bug-replay-trace-snippets.md

关键步骤：
1) 创建测试车辆与运单
2) 第一次签收（应成功）
3) 第二次签收（不同幂等键，业务上应判定 ALREADY_SIGNED）
4) 注入非法 MQ 消息，观察消费异常日志

#### B2. 查看哪块日志

1) 业务签收日志
- 检索 idempotencyKey: bug-replay-sign-001 / bug-replay-sign-002
- 日志文件：apps/api/logs/api-2026-07-06.log

2) MQ 异常日志
- 检索 mq.consume_error
- 日志文件：apps/api/logs/api-2026-07-06.log

#### B3. 定位代码问题

问题现象：
- 重复签收请求虽然返回 idempotentBlocked=true, reason=ALREADY_SIGNED，
  但日志仍写入 waybill.signed（会造成排查误判，误以为重复签收真正执行成功）。

定位代码：
- 文件：apps/api/src/index.ts
- 路由：POST /api/waybills/:id/sign
- 原因：logger.info('waybill.signed') 在重复签收分支也会执行。

#### B4. 修复方案

修复点：
- 在签收/回单接口中，仅当状态真实发生变化（shouldPublish=true）时写成功业务日志。
- 重复请求命中 ALREADY_* 时，不再记录 waybill.signed / waybill.pod_uploaded 成功日志。

修复文件：
- apps/api/src/index.ts

#### B5. 验证闭环

1) 功能验证
- 修复后复现：
  - 第一次签收成功
  - 第二次签收返回 idempotentBlocked=True, reason=ALREADY_SIGNED

2) 日志验证
- 修复后同一复现键：
  - 存在 bug-replay2-sign-001 对应 waybill.signed
  - 不存在 bug-replay2-sign-002 对应 waybill.signed

3) 质量回归
- npm run check --workspace @waybill/api：通过
- npm run test --workspace @waybill/api：通过（9/9）

## 可复用检索命令

```bash
rg "service.started|request.received|waybill.created|waybill.signed|mq.consume_error" apps/api/logs/api-2026-07-06.log
rg "bug-replay2-sign-001|bug-replay2-sign-002" apps/api/logs/api-2026-07-06.log
```

## 验收结论（对应扣分项）

- 已提供运行日志、MQ 消费日志、异常报错日志。
- 已提供随机典型 bug（重复签收）的完整复现与排查闭环。
- 已提供“复现步骤 → 日志定位 → 代码定位 → 修复方案 → 回归验证”的全链路证据。

因此本项验收通过。
