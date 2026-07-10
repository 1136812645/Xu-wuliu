import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { dbExecute, dbQuery, withDbConnection } from './db.js';
import type { FeeComponent, PricingRule, SettlementAdjustmentRule, WaybillDraft, WaybillRecord } from './domain.js';
import { calculateFees, replacePricingRules, replaceSettlementAdjustmentRules, resolveShardTable } from './logic.js';

const CREATE_OPERATION = 'CREATE';
const SETTLEMENT_RULE_SYNC_TTL_MS = 15_000;
let lastSettlementRuleSyncAt = 0;

type TransitionBlockedReason =
  | 'IDEMPOTENCY_KEY_HIT'
  | 'ALREADY_PICKED_UP'
  | 'ALREADY_IN_TRANSIT'
  | 'ALREADY_SIGNED'
  | 'ALREADY_POD_UPLOADED'
  | 'UNIQUE_CONSTRAINT_HIT';

export interface TransitionWaybillResult {
  waybill: WaybillRecord;
  idempotentBlocked: boolean;
  reason?: TransitionBlockedReason;
}

export interface WaybillImportRow extends WaybillDraft {
  idempotencyKey?: string;
}

export interface WaybillBatchImportResult {
  created: number;
  failed: number;
  errors: string[];
}

/**
 * 将数据库中的结算规则同步到进程内计价引擎。
 * 功能：建单/批量导入前刷新定价与调整规则，避免使用陈旧规则计费。
 * @returns 规则同步完成后返回。
 */
async function syncSettlementRulesForDbFeeCalculation(): Promise<void> {
  const now = Date.now();
  if (now - lastSettlementRuleSyncAt < SETTLEMENT_RULE_SYNC_TTL_MS) {
    return;
  }
  await replacePricingRulesFromDb();
  await replaceSettlementAdjustmentRulesFromDb();
  lastSettlementRuleSyncAt = now;
}

interface ShardConfigRow extends RowDataPacket {
  shard_count: number;
}

interface WaybillRow extends RowDataPacket {
  waybill_no: string;
  shipper_id: string;
  carrier_id: string;
  vehicle_id: string;
  mileage_km: number;
  weight_kg: number;
  volume_m3: number;
  goods_name: string;
  status: string;
  total_amount: number;
  created_at: Date | string;
  signed_at: Date | string | null;
  pod_uploaded_at: Date | string | null;
  shard_table?: string;
}

interface FeeRow extends RowDataPacket {
  waybill_no: string;
  fee_type: string;
  fee_label: string;
  amount: number;
  formula_snapshot: string;
}

interface PricingRuleRow extends RowDataPacket {
  id: number;
  shipper_id: string;
  truck_type: '4.2M' | '6.8M' | '9.6M' | '17.5M';
  min_mileage_km: number;
  max_mileage_km: number;
  unit_price_per_km: number;
  loading_fee: number;
  insurance_rate: number;
}

interface SettlementAdjustmentRuleRow extends RowDataPacket {
  id: number;
  code: string;
  label: string;
  category: 'LOADING' | 'DEDUCTION';
  mode: 'FIXED' | 'LINE_HAUL_RATE';
  value: number;
  enabled: number;
  shipper_id: string | null;
  truck_type: '4.2M' | '6.8M' | '9.6M' | '17.5M' | null;
}

function toIso(value: Date | string | null): string | undefined {
  if (value === null) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function safeShardTable(table: string): string {
  if (!/^waybill_\d{6}_\d+$/.test(table)) {
    throw new Error(`Unsafe shard table: ${table}`);
  }
  return table;
}

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { code?: string };
  return candidate.code === 'ER_DUP_ENTRY';
}

async function getShardCount(month: string): Promise<number> {
  const rows = await dbQuery<ShardConfigRow[]>(
    `SELECT shard_count
     FROM waybill_route_config
     WHERE route_month = ?
     LIMIT 1`,
    [month],
  );
  if (rows.length === 0) {
    return 4;
  }
  return rows[0].shard_count > 0 ? rows[0].shard_count : 4;
}

function monthFromDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 将运单号路由到具体物理分表。
 * 功能：组合“月份 + 哈希分片”，并通过表名白名单校验避免 SQL 注入。
 * @param waybillNo 运单号。
 * @param now 当前创建时间。
 * @param shardCount 当前配置分片数。
 * @returns 安全可用的分表名。
 */
function routeTable(waybillNo: string, now: Date, shardCount: number): string {
  return safeShardTable(resolveShardTable(waybillNo, now, shardCount));
}

let batchWaybillSeq = 0;

function nextBatchWaybillNo(now: Date): string {
  batchWaybillSeq = (batchWaybillSeq + 1) % 1_000_000;
  const ts = now.getTime().toString().slice(-8);
  const seq = String(batchWaybillSeq).padStart(6, '0');
  return `WB${ts}${seq}`;
}

function pushBoundedError(target: string[], message: string): void {
  if (target.length < 5) {
    target.push(message);
  }
}

/**
 * 批量写入运单主表数据（单分表）。
 * 功能：将已路由到同一分表的记录合并成一次批量 INSERT，提升吞吐。
 * @param conn 当前事务连接。
 * @param table 目标物理分表名。
 * @param rows 已按分表聚合的预处理行。
 */
async function insertWaybillRowsBatch(
  conn: PoolConnection,
  table: string,
  rows: Array<{ waybillNo: string; draft: WaybillDraft; totalAmount: number; now: Date }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const valuesSql = rows
    .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, \"ASSIGNED\", ?, ?)')
    .join(', ');
  const params = rows.flatMap((item) => [
    item.waybillNo,
    item.draft.shipperId,
    item.draft.carrierId,
    item.draft.vehicleId,
    item.draft.mileageKm,
    item.draft.weightKg,
    item.draft.volumeM3,
    item.draft.goodsName,
    item.totalAmount,
    item.now,
  ]);

  await conn.query(
    `INSERT INTO ${safeShardTable(table)} (
      waybill_no, shipper_id, carrier_id, vehicle_id,
      mileage_km, weight_kg, volume_m3, goods_name,
      status, total_amount, created_at
    ) VALUES ${valuesSql}`,
    params,
  );
}

/**
 * 批量写入运费明细。
 * 功能：按运单号展开费用项后分批插入，避免单 SQL 过长。
 * @param conn 当前事务连接。
 * @param rows 运单号与费用明细集合。
 */
async function insertFeeRowsBatch(
  conn: PoolConnection,
  rows: Array<{ waybillNo: string; fees: FeeComponent[] }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const feeInserts: Array<[string, string, string, number, string]> = [];
  for (const row of rows) {
    for (const fee of row.fees) {
      feeInserts.push([row.waybillNo, fee.type, fee.label, fee.amount, fee.formula]);
    }
  }

  const BATCH_SIZE = 1000;
  for (let i = 0; i < feeInserts.length; i += BATCH_SIZE) {
    const batch = feeInserts.slice(i, i + BATCH_SIZE);
    const valuesSql = batch.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = batch.flatMap((item) => item);
    await conn.query(
      `INSERT INTO waybill_fee_detail (waybill_no, fee_type, fee_label, amount, formula_snapshot)
       VALUES ${valuesSql}`,
      params,
    );
  }
}

/**
 * 批量写入操作日志（CREATE）。
 * 功能：保留数据库级幂等证据，支持重复请求回放与审计。
 * @param conn 当前事务连接。
 * @param rows 运单号与幂等键映射。
 */
async function insertOperationRowsBatch(
  conn: PoolConnection,
  rows: Array<{ waybillNo: string; idempotencyKey: string }>,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const BATCH_SIZE = 1000;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const valuesSql = batch.map(() => '(?, ?, ?, JSON_OBJECT(\"status\", \"ASSIGNED\"))').join(', ');
    const params = batch.flatMap((item) => [item.waybillNo, CREATE_OPERATION, item.idempotencyKey]);
    await conn.query(
      `INSERT INTO waybill_operation_log (waybill_no, operation_type, idempotency_key, operation_result)
       VALUES ${valuesSql}`,
      params,
    );
  }
}

/**
 * 查询批量导入中已存在的 CREATE 幂等键。
 * 功能：命中历史幂等键的行按“成功重放”处理，不计入失败。
 * @param keys 当前导入批次待检查的幂等键。
 * @returns 已存在于 waybill_operation_log 的幂等键集合。
 */
async function findExistingCreateIdempotencyKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) {
    return new Set<string>();
  }

  const existing = new Set<string>();
  const batchSize = 1000;
  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    const placeholders = batch.map(() => '?').join(',');
    const rows = await dbQuery<RowDataPacket[]>(
      `SELECT idempotency_key
       FROM waybill_operation_log
       WHERE operation_type = ?
         AND idempotency_key IN (${placeholders})`,
      [CREATE_OPERATION, ...batch],
    );

    for (const row of rows) {
      existing.add(String(row.idempotency_key));
    }
  }

  return existing;
}

export async function importWaybillChunkInDb(
  rows: WaybillImportRow[],
  importBatchId: string,
): Promise<WaybillBatchImportResult> {
  if (rows.length === 0) {
    return { created: 0, failed: 0, errors: [] };
  }

  await syncSettlementRulesForDbFeeCalculation();

  const now = new Date();
  const month = monthFromDate(now);
  const shardCount = await getShardCount(month);
  const rowInputs = rows.map((row, index) => ({
    row,
    idempotencyKey: row.idempotencyKey ?? `${importBatchId}:${index + 1}`,
  }));
  const existingIdempotencyKeys = await findExistingCreateIdempotencyKeys(rowInputs.map((item) => item.idempotencyKey));

  const prepared: Array<{
    table: string;
    waybillNo: string;
    draft: WaybillDraft;
    fees: FeeComponent[];
    totalAmount: number;
    idempotencyKey: string;
  }> = [];
  const errors: string[] = [];
  let failed = 0;
  let idempotentHits = 0;

  for (let i = 0; i < rowInputs.length; i += 1) {
    const { row, idempotencyKey } = rowInputs[i];
    if (existingIdempotencyKeys.has(idempotencyKey)) {
      // 同一幂等键重复导入视为成功重放，避免单条重复拖垮整批。
      idempotentHits += 1;
      continue;
    }

    try {
      const waybillNo = nextBatchWaybillNo(now);
      const feeResult = calculateFees(row);
      prepared.push({
        table: routeTable(waybillNo, now, shardCount),
        waybillNo,
        draft: row,
        fees: feeResult.fees,
        totalAmount: feeResult.totalAmount,
        idempotencyKey,
      });
    } catch (error) {
      failed += 1;
      pushBoundedError(errors, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  if (prepared.length === 0) {
    return {
      created: idempotentHits,
      failed,
      errors,
    };
  }

  await withDbConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const byTable = new Map<string, Array<{ waybillNo: string; draft: WaybillDraft; totalAmount: number; now: Date }>>();
      for (const row of prepared) {
        // 先按物理分表分组，确保每条 INSERT 仅作用单表，降低锁竞争与 SQL 复杂度。
        const list = byTable.get(row.table) ?? [];
        list.push({
          waybillNo: row.waybillNo,
          draft: row.draft,
          totalAmount: row.totalAmount,
          now,
        });
        byTable.set(row.table, list);
      }

      for (const [table, tableRows] of byTable.entries()) {
        await insertWaybillRowsBatch(conn, table, tableRows);
      }

      await insertFeeRowsBatch(
        conn,
        prepared.map((row) => ({ waybillNo: row.waybillNo, fees: row.fees })),
      );
      await insertOperationRowsBatch(
        conn,
        prepared.map((row) => ({ waybillNo: row.waybillNo, idempotencyKey: row.idempotencyKey })),
      );

      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });

  return {
    created: prepared.length + idempotentHits,
    failed,
    errors,
  };
}

function mapRowToWaybill(row: WaybillRow, fees: FeeComponent[]): WaybillRecord {
  const status = row.status as WaybillRecord['status'];
  return {
    id: row.waybill_no,
    waybillNo: row.waybill_no,
    shipperId: row.shipper_id,
    carrierId: row.carrier_id,
    vehicleId: row.vehicle_id,
    mileageKm: Number(row.mileage_km),
    weightKg: Number(row.weight_kg),
    volumeM3: Number(row.volume_m3),
    goodsName: row.goods_name,
    extraLoadingFee: 0,
    subsidy: 0,
    deduction: 0,
    status,
    fees,
    totalAmount: Number(row.total_amount),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    signedAt: toIso(row.signed_at),
    podUploadedAt: toIso(row.pod_uploaded_at),
    podUploaded: status === 'POD_UPLOADED',
    shardTable: row.shard_table ?? '',
  };
}

async function getWaybillFees(waybillNos: string[]): Promise<Map<string, FeeComponent[]>> {
  if (waybillNos.length === 0) {
    return new Map<string, FeeComponent[]>();
  }

  const placeholders = waybillNos.map(() => '?').join(',');
  const rows = await dbQuery<FeeRow[]>(
    `SELECT waybill_no, fee_type, fee_label, amount, formula_snapshot
     FROM waybill_fee_detail
     WHERE waybill_no IN (${placeholders})
     ORDER BY id ASC`,
    waybillNos,
  );

  const feeMap = new Map<string, FeeComponent[]>();
  for (const row of rows) {
    const list = feeMap.get(row.waybill_no) ?? [];
    list.push({
      type: row.fee_type as FeeComponent['type'],
      label: row.fee_label,
      amount: Number(row.amount),
      formula: row.formula_snapshot,
    });
    feeMap.set(row.waybill_no, list);
  }
  return feeMap;
}

async function loadWaybillByNo(waybillNo: string, tableHints: string[]): Promise<WaybillRecord | null> {
  for (const table of tableHints) {
    const safeTable = safeShardTable(table);
    const rows = await dbQuery<WaybillRow[]>(
      `SELECT
        waybill_no, shipper_id, carrier_id, vehicle_id,
        mileage_km, weight_kg, volume_m3, goods_name,
        status, total_amount, created_at, signed_at, pod_uploaded_at,
        '${safeTable}' AS shard_table
       FROM ${safeTable}
       WHERE waybill_no = ?
       LIMIT 1`,
      [waybillNo],
    );

    if (rows.length > 0) {
      const feeMap = await getWaybillFees([waybillNo]);
      return mapRowToWaybill(rows[0], feeMap.get(waybillNo) ?? []);
    }
  }
  return null;
}

async function listShardTablesByMonth(month: string): Promise<string[]> {
  const shardCount = await getShardCount(month);
  // 当前月份读场景需跨分片扫描时，先展开为具体物理表清单。
  return Array.from({ length: shardCount }, (_, i) => safeShardTable(`waybill_${month}_${i}`));
}

/**
 * 数据库模式创建运单（事务 + 幂等 + 费用快照）。
 * 功能：在一个事务内写入主表、费用明细、操作日志，保证原子性。
 * @param draft 运单草稿。
 * @param idempotencyKey 可选客户端幂等键。
 * @returns 新建记录，或命中幂等后的历史记录。
 */
export async function createWaybillInDb(draft: WaybillDraft, idempotencyKey?: string): Promise<WaybillRecord> {
  await syncSettlementRulesForDbFeeCalculation();
  const feeResult = calculateFees(draft);
  const now = new Date();
  const month = monthFromDate(now);
  const shardCount = await getShardCount(month);
  const waybillNo = `WB${now.getTime().toString().slice(-8)}${Math.floor(Math.random() * 10)}`;
  const table = routeTable(waybillNo, now, shardCount);
  const dedupeKey = idempotencyKey ?? `${waybillNo}:${CREATE_OPERATION}`;

  return withDbConnection(async (conn) => {
    // 建单全链路放进同一事务，防止“主单成功但费用/日志缺失”的不一致。
    await conn.beginTransaction();
    try {
      if (idempotencyKey) {
        const [idemRows] = await conn.query<RowDataPacket[]>(
          `SELECT waybill_no
           FROM waybill_operation_log
           WHERE idempotency_key = ?
           LIMIT 1`,
          [idempotencyKey],
        );

        if (idemRows.length > 0) {
          // 命中幂等键时直接回放历史结果，不再重复插入。
          await conn.rollback();
          const hitNo = String(idemRows[0].waybill_no);
          const tables = await listShardTablesByMonth(month);
          const existing = await loadWaybillByNo(hitNo, tables);
          if (!existing) {
            throw new Error('Idempotency record exists but waybill not found.');
          }
          return existing;
        }
      }

      await conn.query(
        `INSERT INTO ${table} (
          waybill_no, shipper_id, carrier_id, vehicle_id,
          mileage_km, weight_kg, volume_m3, goods_name,
          status, total_amount, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED', ?, ?)`,
        [
          waybillNo,
          draft.shipperId,
          draft.carrierId,
          draft.vehicleId,
          draft.mileageKm,
          draft.weightKg,
          draft.volumeM3,
          draft.goodsName,
          feeResult.totalAmount,
          now,
        ],
      );

      for (const fee of feeResult.fees) {
        await conn.query(
          `INSERT INTO waybill_fee_detail (waybill_no, fee_type, fee_label, amount, formula_snapshot)
           VALUES (?, ?, ?, ?, ?)`,
          [waybillNo, fee.type, fee.label, fee.amount, fee.formula],
        );
      }

      await conn.query(
        `INSERT INTO waybill_operation_log (waybill_no, operation_type, idempotency_key, operation_result)
         VALUES (?, ?, ?, JSON_OBJECT('status', 'ASSIGNED'))`,
        [waybillNo, CREATE_OPERATION, dedupeKey],
      );

      await conn.commit();

      return {
        ...draft,
        id: waybillNo,
        waybillNo,
        status: 'ASSIGNED',
        fees: feeResult.fees,
        totalAmount: feeResult.totalAmount,
        createdAt: now.toISOString(),
        podUploaded: false,
        shardTable: table,
      };
    } catch (error) {
      await conn.rollback();
      throw error;
    }
  });
}

/**
 * 查询最近运单（跨当月全部分片）。
 * 功能：UNION ALL 合并分片结果，并按创建时间倒序返回。
 * @param limit 返回上限。
 * @returns 合并后的运单记录列表。
 */
export async function listRecentWaybillsFromDb(limit = 50): Promise<WaybillRecord[]> {
  const month = monthFromDate(new Date());
  const tables = await listShardTablesByMonth(month);
  const sql = tables
    .map(
      (table) => `SELECT
        waybill_no, shipper_id, carrier_id, vehicle_id,
        mileage_km, weight_kg, volume_m3, goods_name,
        status, total_amount, created_at, signed_at, pod_uploaded_at,
        '${table}' AS shard_table
      FROM ${table}`,
    )
    .join('\nUNION ALL\n');

  const rows = await dbQuery<WaybillRow[]>(
    `SELECT * FROM (
      ${sql}
    ) AS all_waybills
    ORDER BY created_at DESC
    LIMIT ?`,
    [limit],
  );

  const nos = rows.map((row) => row.waybill_no);
  const feeMap = await getWaybillFees(nos);
  return rows.map((row) => mapRowToWaybill(row, feeMap.get(row.waybill_no) ?? []));
}

/**
 * 在数据库模式推进运单状态。
 * 功能：以操作日志幂等为核心，保证重复请求不重复写状态。
 * @param waybillId 运单业务ID。
 * @param action 状态动作（PICKUP/START_TRANSIT/SIGN/UPLOAD_POD）。
 * @param idempotencyKey 可选客户端幂等键。
 * @returns 流转后的运单结果及是否被幂等拦截。
 */
export async function transitionWaybillInDb(
  waybillId: string,
  action: 'PICKUP' | 'START_TRANSIT' | 'SIGN' | 'UPLOAD_POD',
  idempotencyKey?: string,
): Promise<TransitionWaybillResult> {
  const month = monthFromDate(new Date());
  const tables = await listShardTablesByMonth(month);
  const hit = await loadWaybillByNo(waybillId, tables);
  if (!hit) {
    throw new Error('Waybill not found.');
  }

  const operationKey = idempotencyKey ?? `${waybillId}:${action}`;

  return withDbConnection(async (conn) => {
    // 状态流转统一写操作日志，确保并发下也有可追溯幂等证据。
    await conn.beginTransaction();
    try {
      const [idemRows] = await conn.query<RowDataPacket[]>(
        `SELECT id
         FROM waybill_operation_log
         WHERE idempotency_key = ?
         LIMIT 1`,
        [operationKey],
      );

      if (idemRows.length > 0) {
        // 同幂等键重复命中，直接返回当前状态快照，不重复推进状态。
        await conn.rollback();
        const existing = await loadWaybillByNo(waybillId, tables);
        if (!existing) {
          throw new Error('Waybill not found after idempotent hit.');
        }
        return {
          waybill: existing,
          idempotentBlocked: true,
          reason: 'IDEMPOTENCY_KEY_HIT',
        };
      }

      let blockedReason: TransitionBlockedReason | undefined;
      if (action === 'PICKUP') {
        if (hit.status === 'PICKED_UP' || hit.status === 'IN_TRANSIT' || hit.status === 'SIGNED' || hit.status === 'POD_UPLOADED') {
          // 已处于提货后状态，PICKUP 再次执行按幂等拦截处理。
          blockedReason = 'ALREADY_PICKED_UP';
        } else if (hit.status !== 'ASSIGNED') {
          throw new Error('Waybill must be assigned before pickup.');
        } else {
          await conn.query(
            `UPDATE ${safeShardTable(hit.shardTable)}
             SET status = 'PICKED_UP'
             WHERE waybill_no = ?`,
            [waybillId],
          );
        }
      }

      if (action === 'START_TRANSIT') {
        if (hit.status === 'IN_TRANSIT' || hit.status === 'SIGNED' || hit.status === 'POD_UPLOADED') {
          // 已处于运输中及后续状态，再次发车应直接返回当前状态。
          blockedReason = 'ALREADY_IN_TRANSIT';
        } else if (hit.status !== 'PICKED_UP') {
          throw new Error('Waybill must be picked up before transit.');
        } else {
          await conn.query(
            `UPDATE ${safeShardTable(hit.shardTable)}
             SET status = 'IN_TRANSIT'
             WHERE waybill_no = ?`,
            [waybillId],
          );
        }
      }

      if (action === 'SIGN') {
        if (hit.status === 'SIGNED' || hit.status === 'POD_UPLOADED') {
          // 签收属于关键终态，重复签收不应改写 signed_at。
          blockedReason = 'ALREADY_SIGNED';
        } else {
          await conn.query(
            `UPDATE ${safeShardTable(hit.shardTable)}
             SET status = 'SIGNED', signed_at = NOW()
             WHERE waybill_no = ?`,
            [waybillId],
          );
        }
      }

      if (action === 'UPLOAD_POD') {
        if (hit.status === 'POD_UPLOADED') {
          // 回单已上传时重复请求按幂等成功返回。
          blockedReason = 'ALREADY_POD_UPLOADED';
        } else if (hit.status !== 'SIGNED') {
          throw new Error('Waybill must be signed before POD upload.');
        } else {
          await conn.query(
            `UPDATE ${safeShardTable(hit.shardTable)}
             SET status = 'POD_UPLOADED', pod_uploaded_at = NOW()
             WHERE waybill_no = ?`,
            [waybillId],
          );
        }
      }

      if (blockedReason) {
        // 业务幂等命中不入日志，直接回放当前状态，避免制造噪声操作记录。
        await conn.rollback();
        const existing = await loadWaybillByNo(waybillId, tables);
        if (!existing) {
          throw new Error('Waybill not found after blocked transition.');
        }
        return {
          waybill: existing,
          idempotentBlocked: true,
          reason: blockedReason,
        };
      }

      await conn.query(
        `INSERT INTO waybill_operation_log (waybill_no, operation_type, idempotency_key, operation_result)
         VALUES (?, ?, ?, JSON_OBJECT('status', ?))`,
        [
          waybillId,
          action,
          operationKey,
          action === 'PICKUP'
            ? 'PICKED_UP'
            : action === 'START_TRANSIT'
              ? 'IN_TRANSIT'
              : action === 'SIGN'
                ? 'SIGNED'
                : 'POD_UPLOADED',
        ],
      );

      await conn.commit();

      const updated = await loadWaybillByNo(waybillId, tables);
      if (!updated) {
        throw new Error('Waybill not found after transition.');
      }
      return {
        waybill: updated,
        idempotentBlocked: false,
      };
    } catch (error) {
      await conn.rollback();
      if (isDuplicateKeyError(error)) {
        // 极端并发下若唯一键兜底触发，也按幂等命中返回，避免误报失败。
        const existing = await loadWaybillByNo(waybillId, tables);
        if (!existing) {
          throw new Error('Waybill not found after duplicate-key interception.');
        }
        return {
          waybill: existing,
          idempotentBlocked: true,
          reason: 'UNIQUE_CONSTRAINT_HIT',
        };
      }
      throw error;
    }
  });
}

export async function findWaybillInDb(waybillId: string): Promise<WaybillRecord | null> {
  const month = monthFromDate(new Date());
  const tables = await listShardTablesByMonth(month);
  return loadWaybillByNo(waybillId, tables);
}

export async function findCreateWaybillByIdempotencyKeyInDb(idempotencyKey: string): Promise<WaybillRecord | null> {
  const rows = await dbQuery<RowDataPacket[]>(
    `SELECT waybill_no
     FROM waybill_operation_log
     WHERE idempotency_key = ?
       AND operation_type = ?
     LIMIT 1`,
    [idempotencyKey, CREATE_OPERATION],
  );

  if (rows.length === 0) {
    return null;
  }

  const month = monthFromDate(new Date());
  const tables = await listShardTablesByMonth(month);
  return loadWaybillByNo(String(rows[0].waybill_no), tables);
}

export async function hasActiveWaybillForVehicleInDb(vehicleId: string): Promise<boolean> {
  const month = monthFromDate(new Date());
  const tables = await listShardTablesByMonth(month);
  const activeStatuses = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED'];

  for (const table of tables) {
    const rows = await dbQuery<RowDataPacket[]>(
      `SELECT waybill_no
       FROM ${safeShardTable(table)}
       WHERE vehicle_id = ?
         AND status IN (?, ?, ?, ?)
       LIMIT 1`,
      [vehicleId, ...activeStatuses],
    );
    if (rows.length > 0) {
      return true;
    }
  }

  return false;
}

export async function listPricingRulesFromDb(): Promise<PricingRule[]> {
  const rows = await dbQuery<PricingRuleRow[]>(
    `SELECT
      id,
      shipper_id,
      truck_type,
      min_mileage_km,
      max_mileage_km,
      unit_price_per_km,
      loading_fee,
      insurance_rate
     FROM pricing_rule
     ORDER BY shipper_id ASC, truck_type ASC, min_mileage_km ASC`,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    shipperId: row.shipper_id,
    truckType: row.truck_type,
    minMileageKm: Number(row.min_mileage_km),
    maxMileageKm: Number(row.max_mileage_km),
    unitPricePerKm: Number(row.unit_price_per_km),
    loadingFee: Number(row.loading_fee),
    insuranceRate: Number(row.insurance_rate),
  }));
}

export async function upsertPricingRuleInDb(rule: PricingRule): Promise<PricingRule[]> {
  if (typeof rule.id === 'number') {
    await dbQuery(
      `UPDATE pricing_rule
       SET shipper_id = ?, truck_type = ?, min_mileage_km = ?, max_mileage_km = ?,
           unit_price_per_km = ?, loading_fee = ?, insurance_rate = ?
       WHERE id = ?`,
      [
        rule.shipperId,
        rule.truckType,
        rule.minMileageKm,
        rule.maxMileageKm,
        rule.unitPricePerKm,
        rule.loadingFee,
        rule.insuranceRate,
        rule.id,
      ],
    );
  } else {
    await dbQuery(
      `INSERT INTO pricing_rule (
        shipper_id, truck_type, min_mileage_km, max_mileage_km,
        unit_price_per_km, loading_fee, insurance_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.shipperId,
        rule.truckType,
        rule.minMileageKm,
        rule.maxMileageKm,
        rule.unitPricePerKm,
        rule.loadingFee,
        rule.insuranceRate,
      ],
    );
  }

  return replacePricingRulesFromDb();
}

export async function deletePricingRuleInDb(id: number): Promise<PricingRule[]> {
  const result = await dbExecute(`DELETE FROM pricing_rule WHERE id = ?`, [id]);
  if (result.affectedRows < 1) {
    throw new Error('Pricing rule not found or already deleted.');
  }
  return replacePricingRulesFromDb();
}

export async function ensureSettlementAdjustmentRuleTable(): Promise<void> {
  await dbQuery(
    `CREATE TABLE IF NOT EXISTS settlement_adjustment_rule (
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      code VARCHAR(64) NOT NULL,
      label VARCHAR(128) NOT NULL,
      category ENUM('LOADING', 'DEDUCTION') NOT NULL,
      mode ENUM('FIXED', 'LINE_HAUL_RATE') NOT NULL,
      value DECIMAL(18,4) NOT NULL,
      enabled TINYINT(1) NOT NULL DEFAULT 1,
      shipper_id VARCHAR(64) NULL,
      truck_type ENUM('4.2M', '6.8M', '9.6M', '17.5M') NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_settlement_adjustment_code (code),
      KEY idx_settlement_adjustment_scope (shipper_id, truck_type, enabled)
    )`,
  );
}

export async function listSettlementAdjustmentRulesFromDb(): Promise<SettlementAdjustmentRule[]> {
  await ensureSettlementAdjustmentRuleTable();
  const rows = await dbQuery<SettlementAdjustmentRuleRow[]>(
    `SELECT id, code, label, category, mode, value, enabled, shipper_id, truck_type
     FROM settlement_adjustment_rule
     ORDER BY category ASC, code ASC`,
  );

  return rows.map((row) => ({
    id: Number(row.id),
    code: row.code,
    label: row.label,
    category: row.category,
    mode: row.mode,
    value: Number(row.value),
    enabled: Boolean(row.enabled),
    shipperId: row.shipper_id ?? undefined,
    truckType: row.truck_type ?? undefined,
  }));
}

export async function replaceSettlementAdjustmentRulesFromDb(): Promise<SettlementAdjustmentRule[]> {
  const rules = await listSettlementAdjustmentRulesFromDb();
  replaceSettlementAdjustmentRules(rules);
  return rules;
}

export async function upsertSettlementAdjustmentRuleInDb(rule: SettlementAdjustmentRule): Promise<SettlementAdjustmentRule[]> {
  await ensureSettlementAdjustmentRuleTable();

  if (typeof rule.id === 'number') {
    await dbQuery(
      `UPDATE settlement_adjustment_rule
       SET code = ?, label = ?, category = ?, mode = ?, value = ?, enabled = ?, shipper_id = ?, truck_type = ?
       WHERE id = ?`,
      [
        rule.code,
        rule.label,
        rule.category,
        rule.mode,
        rule.value,
        rule.enabled ? 1 : 0,
        rule.shipperId ?? null,
        rule.truckType ?? null,
        rule.id,
      ],
    );
  } else {
    await dbQuery(
      `INSERT INTO settlement_adjustment_rule (
        code, label, category, mode, value, enabled, shipper_id, truck_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rule.code,
        rule.label,
        rule.category,
        rule.mode,
        rule.value,
        rule.enabled ? 1 : 0,
        rule.shipperId ?? null,
        rule.truckType ?? null,
      ],
    );
  }

  return replaceSettlementAdjustmentRulesFromDb();
}

export async function deleteSettlementAdjustmentRuleInDb(id: number): Promise<SettlementAdjustmentRule[]> {
  await ensureSettlementAdjustmentRuleTable();
  const result = await dbExecute(`DELETE FROM settlement_adjustment_rule WHERE id = ?`, [id]);
  if (result.affectedRows < 1) {
    throw new Error('Settlement adjustment rule not found or already deleted.');
  }
  return replaceSettlementAdjustmentRulesFromDb();
}

export async function replacePricingRulesFromDb(): Promise<PricingRule[]> {
  const rules = await listPricingRulesFromDb();
  if (rules.length > 0) {
    replacePricingRules(rules);
  }
  return rules;
}
