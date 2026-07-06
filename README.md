# 运单 & 结算管理后台

该仓库根据 PDF 题目要求，提供一套可运行的内部运单与结算管理后台设计样例，包含：

- 前端管理后台：React + Vite
- 后端 API：Node.js + Express + TypeScript
- 分布式能力设计：MySQL 分表、Redis、RabbitMQ、幂等、分布式锁
- 交付文档：业务流程、ER、技术方案、部署说明

## 目录结构

```text
apps/
  api/   后端 API
  web/   管理后台前端
docs/    设计与部署文档
```

## 本地运行

```bash
npm install
npm run dev:api
npm run dev:web
```

- API 默认地址：http://localhost:3000
- Web 默认地址：http://localhost:5173

## 自测

```bash
npm test
```

覆盖内容：

- 多维度运费叠加与负金额场景
- 零里程、空运单等边界
- 载重/体积双约束与拆单建议
- 重复开单、重复签收、重复回单上传幂等
- 证件预警与非法日期容错

## Docker 运行

```bash
docker compose up --build
```

- Gateway / Web / API：http://localhost:8080
- API 通过 Nginx 网关转发到双实例 api-1 / api-2
- RabbitMQ 管理台：http://localhost:15672
- MySQL：http://localhost:3306

单机分布式模拟说明：

- gateway：Nginx 统一入口
- web：前端静态站点
- api-1、api-2：双应用实例，模拟横向扩容
- mysql、redis、rabbitmq：共享基础设施

可以通过停止 api-1 或 api-2 任一实例，验证另一实例继续提供服务：

```bash
docker compose stop api-1
```

## 高可用与故障转移

已落地能力：

- 双 API 实例：`api-1` + `api-2`
- 网关自动切换：Nginx upstream + `proxy_next_upstream` 重试
- 实例被动健康探测：`max_fails` + `fail_timeout`
- 实例健康检查：API `healthcheck`
- 进程保活：关键服务 `restart: unless-stopped`
- 实例可观测：响应头 `x-instance-id`，接口 `GET /api/ha/instance`

故障演练（本地网络无法拉取镜像时可用）：

```bash
# 终端1
PORT=3101 INSTANCE_ID=api-1 npm run dev:api

# 终端2
PORT=3102 INSTANCE_ID=api-2 npm run dev:api

# 终端3
node infra/ha/local-gateway.mjs
```

通过网关验证：

```bash
curl -i http://127.0.0.1:18080/health
```

停掉 `api-1` 后再次访问，仍返回 `200` 且 `instanceId=api-2`，证明单点故障不中断业务。

## 已覆盖的核心需求

- 运单全流程页面与状态流转展示
- 多维度运费叠加计算，支持负数补贴/扣款
- 车辆载重 + 体积双约束校验
- 证件过期、临期、非法日期预警
- 重复签收 / 重复回单上传幂等拦截思路
- 按月 + hash 的运单分表真实落库（MySQL，支持 route_config 扩展分片数）
- RabbitMQ 可靠消息链路（confirm 发布、重试队列、死信队列、消费去重）
- Google 登录 / RBAC / Docker / 分布式部署方案说明

## MQ 验收辅助接口

- `GET /api/mq/status`：查看 MQ 连接状态、队列配置、消费统计、outbox 状态
- `POST /api/mq/outbox/flush`：手动重发 outbox 事件

说明：当 RabbitMQ 不可用时，运单状态事件先落入 outbox，待恢复后可通过 flush 重发，避免业务操作丢失。

## 设计文档

详细方案见 [docs/solution.md](docs/solution.md)。

补充验收材料：

- [docs/test-cases.md](docs/test-cases.md)
- [docs/bug-runbook.md](docs/bug-runbook.md)
- [docs/project-overview.md](docs/project-overview.md)

数据库初始化脚本位于 [db/init/01_schema.sql](db/init/01_schema.sql) 和 [db/init/02_seed.sql](db/init/02_seed.sql)。

若你已经初始化过旧版表结构（状态字段为 `VARCHAR`），可执行升级脚本 [db/init/03_enum_upgrade.sql](db/init/03_enum_upgrade.sql) 将关键业务字段升级为 `ENUM`。

索引与报表慢查询优化可执行：

- 升级索引与日报聚合表： [db/init/04_index_report_upgrade.sql](db/init/04_index_report_upgrade.sql)
- 慢查询 `EXPLAIN` 验证脚本： [db/init/05_slow_query_validation.sql](db/init/05_slow_query_validation.sql)

Redis 缓存观测接口：

- `GET /api/bootstrap`、`GET /api/dashboard` 返回 `x-cache-hit` 响应头
- `GET /api/cache/status` 查看关键缓存键存在状态

结算规则配置接口：

- `GET /api/pricing-rules` 查看当前生效规则（DB可用时读取表数据）
- `POST /api/pricing-rules` 内存规则快速微调（便于演示与快速迭代）
- `POST /api/pricing-rules/reload` 从 `pricing_rule` 表重载规则到运行态

调试日志留存：

- API 运行日志按天写入 `apps/api/logs/api-YYYY-MM-DD.log`
- 日志包含请求、建单、签收、回单、规则重载、MQ/DB异常等关键事件
