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

## 环境变量快速配置

已提供模板文件：

- `apps/api/.env.example`
- `apps/web/.env.example`
- `.env.example`（docker compose 变量）

可直接复制：

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item apps/api/.env.example apps/api/.env -Force
Copy-Item apps/web/.env.example apps/web/.env -Force
Copy-Item .env.example .env -Force
```

Google 登录至少需要在 `apps/api/.env` 配置：

- `GOOGLE_CLIENT_ID`

使用 Docker Compose 启动时，请在根目录 `.env` 配置同名变量（compose 会注入到 `api-1` / `api-2`）：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_ADMIN_EMAILS`
- `GOOGLE_CARRIER_EMAILS`
- `GOOGLE_SHIPPER_EMAILS`

角色映射可选：

- `GOOGLE_ADMIN_EMAILS`
- `GOOGLE_CARRIER_EMAILS`
- `GOOGLE_SHIPPER_EMAILS`

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

## 第三方登录与权限控制

已实现可交互的登录与权限控制链路：

- 前端登录页：支持 Google 登录按钮（GIS）和开发模式登录
- 后端登录接口：
  - `GET /api/auth/config`
  - `POST /api/auth/google`
  - `POST /api/auth/dev-login`
  - `GET /api/auth/me`
  - `POST /api/auth/logout`
- 会话方式：前端保存令牌并通过 `Authorization: Bearer <token>` 调用受保护接口
- RBAC：后端对关键写操作做权限拦截（401/403），前端按权限禁用操作按钮

### Google 登录配置

在 API 进程环境变量中配置：

- `GOOGLE_CLIENT_ID`：Google OAuth Client ID（必填，才能启用 Google 真登录）
- `GOOGLE_ADMIN_EMAILS`：管理员邮箱列表（逗号分隔）
- `GOOGLE_CARRIER_EMAILS`：承运商角色邮箱列表（逗号分隔）
- `GOOGLE_SHIPPER_EMAILS`：货主角色邮箱列表（逗号分隔）
- `DEV_LOGIN_ENABLED`：开发登录开关，默认开启，设为 `0` 关闭

未配置 `GOOGLE_CLIENT_ID` 时，前端不会渲染 Google 真登录按钮，可使用开发模式登录验证全流程。

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

## 结算规则微调与配置解耦

已实现“结算逻辑与业务配置解耦”设计：

- 核心计算主流程统一由 `calculateFees` 执行，不因业务规则变化而改动主流程代码
- 阶梯运价从 `pricing_rule` 配置表读取
- 装卸费项 / 扣款类型从 `settlement_adjustment_rule` 配置表读取
- 管理员在前端“结算规则”页即可直接修改并保存配置
- 配置保存后，新建运单自动使用最新规则，无需改动核心计算逻辑

管理员修改步骤：

1. 使用 `ADMIN` 角色登录后台
2. 进入“结算规则”页面
3. 在“阶梯运价编辑”区域直接修改单价 / 装卸费 / 保费率并点击“保存”
4. 在“装卸费 / 扣款规则配置”区域新增规则编码、规则名称、分类、模式、规则值、适用货主/车型后点击“新增”
5. 返回运单中心新建运单，系统会自动按新配置计算费用

对应能力：

- 临时修改阶梯运价：修改 `pricing_rule`
- 新增装卸费项：新增 `settlement_adjustment_rule` 且 `category=LOADING`
- 新增扣款类型：新增 `settlement_adjustment_rule` 且 `category=DEDUCTION`

调试日志留存：

- API 运行日志按天写入 `apps/api/logs/api-YYYY-MM-DD.log`
- 日志包含请求、建单、签收、回单、规则重载、MQ/DB异常等关键事件

批量导入（10k）流式压测：

- 启动 API（建议 DB 模式）：`npm run dev:api`
- 执行流式导入压测：`npx tsx scripts/perf-import-10k-stream.ts`
- 可调参数：
  - `IMPORT_TOTAL`（默认 10000）
  - `IMPORT_CHUNK_SIZE`（默认 200）
  - `IMPORT_API_BASE`（默认 `http://127.0.0.1:3100`）
- 脚本特性：
  - 先生成 CSV 模板（Excel 可直接打开）
  - 按行流式读取（readline）
  - 按 chunk 调用后台导入接口分批入库，不一次性全量加载内存
