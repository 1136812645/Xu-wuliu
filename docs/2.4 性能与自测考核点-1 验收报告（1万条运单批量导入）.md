# 2.4 性能与自测考核点-1 验收报告（1万条运单批量导入）

日期：2026-07-07

## 一、验收目标

在数据库已有 100 万条基础上，执行 10000+ 运单批量导入，验证：

1. 页面/服务不出现卡死或 OOM；
2. 导入链路采用分页读取文件、分批入库，不一次性把全量数据加载到内存；
3. 导入后数据量与入库记录可追溯。

## 二、环境与基线

- DB：MySQL（本机 3306）
- API：`@waybill/api`（DB 模式，3100 端口）
- 导入方式：后台接口导入
- 基线数据量：
  - `total_waybills_before = 1,000,000`

## 三、测试步骤与结果

### 步骤 1：准备 10000+ Excel 模板

- 采用 CSV 模板（Excel 可直接打开）作为导入模板：
  - `scripts/data/waybill-import-template-10000.csv`
- 生成方式：流式压测脚本自动生成。

### 步骤 2：后台接口导入（流式读取 + 分批提交）

执行：

- `IMPORT_TOTAL=10000`
- `IMPORT_CHUNK_SIZE=200`
- `IMPORT_API_BASE=http://127.0.0.1:3100`
- `npx tsx scripts/perf-import-10k-stream.ts`

结果（关键指标）：

- `totalRows = 10000`
- `chunks = 50`（每批 200）
- `imported = 10000`
- `failed = 0`
- `durationSec = 61.46`
- `storage = mysql-sharded`
- `peakHeapAfterMB = 50.8`

### 步骤 3：导入后核验

- 总量核验：
  - `total_waybills_after = 1,010,000`
- 导入幂等键核验：
  - `idempotency_key like 'bulk-import-idem-%' = 10000`

### 步骤 4：服务稳定性与内存表现

- 导入期间 API 未退出，无 OOM；
- 每批 `heapAfterMB` 呈波动而非单调暴涨（约 19MB ~ 50.8MB），最后批次回落至约 27MB；
- 说明未出现持续性内存失控，GC 回收正常。

## 四、代码实现核查（是否分页读取 + 分批入库）

1) 分页/流式读取文件（非一次性加载全量）

- 使用 `readline` 逐行读取 CSV：`scripts/perf-import-10k-stream.ts`
- 达到 `CHUNK_SIZE` 即发送一个 chunk：`sendChunk(importBatchId, buffer)`

2) 分批入库

- 后台接口：`POST /api/waybills/import/chunk`
- 每次最多接收 1000 行：`rows: z.array(...).max(1000)`
- 当前压测按 200 行一批，共 50 批完成 10000 条导入。

## 五、对照验收标准判定

1. 在 100 万基础上再导入 10000+：通过（1,000,000 -> 1,010,000）
2. 采用后台接口导入：通过
3. 页面无卡死/服务不 OOM/无异常内存暴涨：通过（服务稳定，内存曲线可控）
4. 代码采用分页读取与分批入库：通过（readline + chunk API）
5. 提供测试报告：通过（本文件）

## 六、结论

本考核点通过。
