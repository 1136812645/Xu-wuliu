# 缓存使用场景设计验收报告（2026-07-06）

## 验收标准

1. 查看 Redis Key + 代码缓存逻辑
   - 高频读取基础档案：货主、承运商、车辆信息缓存
   - 分布式锁缓存、幂等请求记录缓存
   - 首页统计报表热点数据缓存
2. 校验：新增/修改档案后，缓存主动更新/失效，不出现长期脏数据
3. 文档标注：缓存场景、淘汰策略、穿透击穿防护方案

## 结论

- 标准 1：通过
- 标准 2：通过
- 标准 3：通过

## 1) Redis Key + 代码缓存逻辑（通过）

### 1.1 基础档案缓存（已落地）

- Shipper 详情：`shipper:detail:{id}`，TTL 30min
- Carrier 详情：`carrier:detail:{id}`，TTL 30min
- Vehicle 详情：`vehicle:detail:{id}`，TTL 30min

代码证据：
- apps/api/src/index.ts（GET /api/archives/shippers/:id, /carriers/:id, /vehicles/:id）
- apps/api/src/redis-cache.ts（rememberJson + EX TTL）

运行态证据：
- shipper:detail 命中序列：`x-cache-hit` = 0 -> 1
- carrier:detail 命中序列：`x-cache-hit` = 0 -> 1
- vehicle:detail 命中序列：`x-cache-hit` = 0 -> 1
- Redis key 观察：`carrier:detail:carrier-1`、`vehicle:detail:vehicle-1`

### 1.2 分布式锁与幂等缓存（已落地）

- 分布式锁键：`lock:create-waybill:{shipperId}:{vehicleId}`（PX 过期 + Lua 安全释放）
- 幂等键：`idem:{idempotencyKey}`，TTL 24h

代码证据：
- apps/api/src/redis-lock.ts
- apps/api/src/redis-cache.ts
- apps/api/src/index.ts（开单/签收/回单的幂等快照读写）

运行态证据：
- 同幂等键重复开单：首次 201，二次 200，返回同一运单 ID
- Redis 中 `idem:*` 存在，示例 TTL 为 86400 秒

### 1.3 首页与热点缓存（已落地）

- `cache:bootstrap:v1`（TTL 30min）
- `cache:dashboard:v1`（TTL 20s）
- `cache:waybills:recent:50`（TTL 15s，DB模式生效）

代码证据：
- apps/api/src/index.ts（/api/bootstrap, /api/dashboard, /api/waybills）
- apps/api/src/redis-cache.ts

运行态证据：
- /api/bootstrap 命中序列：0 -> 1
- /api/dashboard 命中序列：0 -> 1

## 2) 新增/修改档案后缓存失效（通过）

已验证流程：

1. 新增 shipper 后首次读取：`x-cache-hit=0`（回源）
2. 第二次读取：`x-cache-hit=1`（命中）
3. 更新该 shipper 后再次读取：`x-cache-hit=0`（主动失效后回源）
4. 再次读取：`x-cache-hit=1`（重新回填）
5. 返回数据已是更新后的 name，未出现长期脏数据

另外，业务写接口（开单/签收/回单）会主动失效热点缓存：
- 验证示例：签收成功后 `cache:dashboard:v1` TTL 从正数变为 -2（键被删除）

## 3) 文档标注完整性（通过）

方案文档已标注：
- 缓存使用场景
- TTL 与淘汰策略
- 热点缓存失效策略
- 穿透防护（空值短 TTL）
- 分布式锁防死锁策略

证据文件：
- docs/solution.md（第 6 节缓存设计）

## 本轮执行摘要

- 新增档案缓存接口与失效逻辑（API）
- 运行态验证 x-cache-hit / Redis key / TTL
- 回归检查：TypeScript check 通过，API 测试 9/9 通过
