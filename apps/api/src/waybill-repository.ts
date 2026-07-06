import type { RowDataPacket } from 'mysql2/promise';
import { dbQuery, withDbConnection } from './db.js';
import type { FeeComponent, PricingRule, WaybillDraft, WaybillRecord } from './domain.js';
import { calculateFees, replacePricingRules, resolveShardTable } from './logic.js';

const CREATE_OPERATION = 'CREATE';

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
  shipper_id: string;
  truck_type: '4.2M' | '6.8M' | '9.6M' | '17.5M';
  min_mileage_km: number;
  max_mileage_km: number;
  unit_price_per_km: number;
  loading_fee: number;
  insurance_rate: number;
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

function routeTable(waybillNo: string, now: Date, shardCount: number): string {
  return safeShardTable(resolveShardTable(waybillNo, now, shardCount));
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
  return Array.from({ length: shardCount }, (_, i) => safeShardTable(`waybill_${month}_${i}`));
}

export async function createWaybillInDb(draft: WaybillDraft, idempotencyKey?: string): Promise<WaybillRecord> {
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

export async function transitionWaybillInDb(
  waybillId: string,
  action: 'SIGN' | 'UPLOAD_POD',
  idempotencyKey?: string,
): Promise<WaybillRecord> {
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
        return existing;
      }

      if (action === 'SIGN') {
        if (hit.status !== 'SIGNED' && hit.status !== 'POD_UPLOADED') {
          await conn.query(
            `UPDATE ${safeShardTable(hit.shardTable)}
             SET status = 'SIGNED', signed_at = NOW()
             WHERE waybill_no = ?`,
            [waybillId],
          );
        }
      }

      if (action === 'UPLOAD_POD') {
        if (hit.status !== 'SIGNED' && hit.status !== 'POD_UPLOADED') {
          throw new Error('Waybill must be signed before POD upload.');
        }
        if (hit.status !== 'POD_UPLOADED') {
          await conn.query(
            `UPDATE ${safeShardTable(hit.shardTable)}
             SET status = 'POD_UPLOADED', pod_uploaded_at = NOW()
             WHERE waybill_no = ?`,
            [waybillId],
          );
        }
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
      return updated;
    } catch (error) {
      await conn.rollback();
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
    shipperId: row.shipper_id,
    truckType: row.truck_type,
    minMileageKm: Number(row.min_mileage_km),
    maxMileageKm: Number(row.max_mileage_km),
    unitPricePerKm: Number(row.unit_price_per_km),
    loadingFee: Number(row.loading_fee),
    insuranceRate: Number(row.insurance_rate),
  }));
}

export async function replacePricingRulesFromDb(): Promise<PricingRule[]> {
  const rules = await listPricingRulesFromDb();
  if (rules.length > 0) {
    replacePricingRules(rules);
  }
  return rules;
}
