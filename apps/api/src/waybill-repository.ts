import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { dbExecute, dbQuery, withDbConnection } from './db.js';
import type { FeeComponent, PricingRule, SettlementAdjustmentRule, WaybillDraft, WaybillRecord } from './domain.js';
import { calculateFees, replacePricingRules, replaceSettlementAdjustmentRules, resolveShardTable } from './logic.js';

const CREATE_OPERATION = 'CREATE';
const SETTLEMENT_RULE_SYNC_TTL_MS = 15_000;
let lastSettlementRuleSyncAt = 0;

type TransitionBlockedReason =
  | 'IDEMPOTENCY_KEY_HIT'
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
 * Sync DB-backed settlement rules into the in-process calculation engine before DB create/import pricing.
 * @returns resolves when pricing and adjustment rules are refreshed from DB.
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
 * Route one waybill number to a physical shard table.
 * @param waybillNo waybill business number.
 * @param now current create time.
 * @param shardCount route config shard count.
 * @returns safe shard table name.
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
 * Batch insert waybill base rows into one physical shard table.
 * @param conn active transactional DB connection.
 * @param table concrete shard table name.
 * @param rows prepared rows already routed to the same shard.
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
 * Batch insert fee detail rows for imported or created waybills.
 * @param conn active transactional DB connection.
 * @param rows fee detail payload grouped by waybill number.
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
 * Batch insert operation-log rows so CREATE requests keep DB-level idempotency evidence.
 * @param conn active transactional DB connection.
 * @param rows waybill number and idempotency key pairs.
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
 * Find which CREATE idempotency keys already exist so batch import can treat them as successful replays.
 * @param keys candidate idempotency keys from the incoming import chunk.
 * @returns set of keys that are already present in waybill_operation_log.
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
      // Re-importing the same row is counted as success so one duplicate does not fail the entire chunk.
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
        // Group by physical shard first so each INSERT statement stays table-local and efficient.
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
  // Expand to concrete physical tables for cross-shard reads in current month.
  return Array.from({ length: shardCount }, (_, i) => safeShardTable(`waybill_${month}_${i}`));
}

/**
 * Create one waybill in DB with transactional idempotency and fee snapshots.
 * @param draft waybill draft payload.
 * @param idempotencyKey optional client idempotency key.
 * @returns created or previously created waybill record.
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
    // Create flow is wrapped in one transaction to keep waybill/fees/operation-log atomic.
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
          // If idempotency key already exists, return prior result instead of inserting duplicates.
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
 * List recent waybills across all monthly shards.
 * @param limit max rows to return.
 * @returns merged recent waybill records sorted by created_at desc.
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
 * Transition waybill status in DB with operation-log idempotency.
 * @param waybillId waybill business id.
 * @param action SIGN or UPLOAD_POD.
 * @param idempotencyKey optional client idempotency key.
 * @returns latest waybill record.
 */
export async function transitionWaybillInDb(
  waybillId: string,
  action: 'SIGN' | 'UPLOAD_POD',
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
    // Transition flow records an idempotent operation log before returning final state.
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
      if (action === 'SIGN') {
        if (hit.status === 'SIGNED' || hit.status === 'POD_UPLOADED') {
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
        [waybillId, action, operationKey, action === 'SIGN' ? 'SIGNED' : 'POD_UPLOADED'],
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
