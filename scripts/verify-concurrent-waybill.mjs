import mysql from 'mysql2/promise';

const baseUrl = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const dbConfig = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? 'root',
  database: process.env.DB_NAME ?? 'waybill_admin',
};
const vehicleId = process.env.VEHICLE_ID ?? 'vehicle-2';
const shipperId = process.env.SHIPPER_ID ?? 'shipper-1';
const carrierId = process.env.CARRIER_ID ?? 'carrier-1';
const concurrency = Number(process.env.CONCURRENCY ?? 50);
const totalRequests = Number(process.env.TOTAL_REQUESTS ?? concurrency);

const activeStatuses = new Set(['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED']);
const shardTables = ['waybill_202607_0', 'waybill_202607_1', 'waybill_202607_2', 'waybill_202607_3'];

function createPayload() {
  return {
    shipperId,
    carrierId,
    vehicleId,
    mileageKm: 12,
    weightKg: 1000,
    volumeM3: 3,
    goodsName: 'concurrency-check-goods',
    extraLoadingFee: 0,
    subsidy: 0,
    deduction: 0,
  };
}

async function requestJson(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10000;
  const timer = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(options.headers ?? {}),
      },
    });
    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return {
      status: response.status,
      headers: response.headers,
      body,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function cleanupVehicle() {
  const list = await requestJson('/api/waybills', { method: 'GET' });
  const items = Array.isArray(list.body?.items) ? list.body.items : [];
  const active = items.filter((item) => item.vehicleId === vehicleId && activeStatuses.has(item.status));

  for (const item of active) {
    if (item.status !== 'SIGNED' && item.status !== 'POD_UPLOADED') {
      await requestJson(`/api/waybills/${item.id}/sign`, {
        method: 'POST',
        headers: { 'x-idempotency-key': `cleanup-sign-${item.id}-${Date.now()}` },
        body: '{}',
      });
    }

    await requestJson(`/api/waybills/${item.id}/upload-pod`, {
      method: 'POST',
      headers: { 'x-idempotency-key': `cleanup-pod-${item.id}-${Date.now()}` },
      body: '{}',
    });
  }
}

async function collectDbMetrics(connection, createdWaybillNo) {
  const totalSql = `
    SELECT COUNT(*) AS total_count
    FROM (
      SELECT id, vehicle_id, status FROM waybill_202607_0
      UNION ALL SELECT id, vehicle_id, status FROM waybill_202607_1
      UNION ALL SELECT id, vehicle_id, status FROM waybill_202607_2
      UNION ALL SELECT id, vehicle_id, status FROM waybill_202607_3
    ) waybills
  `;
  const activeSql = `
    SELECT COUNT(*) AS active_count
    FROM (
      SELECT vehicle_id, status FROM waybill_202607_0
      UNION ALL SELECT vehicle_id, status FROM waybill_202607_1
      UNION ALL SELECT vehicle_id, status FROM waybill_202607_2
      UNION ALL SELECT vehicle_id, status FROM waybill_202607_3
    ) waybills
    WHERE vehicle_id = ?
      AND status IN ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED')
  `;
  const feeSql = createdWaybillNo
    ? `
      SELECT COUNT(*) AS fee_rows, COUNT(DISTINCT fee_type) AS distinct_fee_types, COALESCE(SUM(amount), 0) AS total_fee_amount
      FROM waybill_fee_detail
      WHERE waybill_no = ?
    `
    : null;
  const operationSql = createdWaybillNo
    ? `
      SELECT COUNT(*) AS operation_rows
      FROM waybill_operation_log
      WHERE waybill_no = ? AND operation_type = 'CREATE'
    `
    : null;

  const [totalRows] = await connection.query(totalSql);
  const [activeRows] = await connection.query(activeSql, [vehicleId]);
  const feeRows = feeSql ? await connection.query(feeSql, [createdWaybillNo]) : [[{ fee_rows: 0, distinct_fee_types: 0, total_fee_amount: '0' }]];
  const operationRows = operationSql ? await connection.query(operationSql, [createdWaybillNo]) : [[{ operation_rows: 0 }]];

  const totalCount = Number(totalRows[0].total_count);
  const activeCount = Number(activeRows[0].active_count);
  const feeSummary = createdWaybillNo ? feeRows[0][0] : { fee_rows: 0, distinct_fee_types: 0, total_fee_amount: '0' };
  const operationCount = createdWaybillNo ? Number(operationRows[0][0].operation_rows) : 0;

  return {
    totalCount,
    activeCount,
    feeRows: Number(feeSummary.fee_rows),
    distinctFeeTypes: Number(feeSummary.distinct_fee_types),
    totalFeeAmount: Number(feeSummary.total_fee_amount),
    operationCount,
  };
}

async function runConcurrentCreates(count) {
  const results = Array.from({ length: count }, () => null);
  let cursor = 0;
  const startedAt = Date.now();

  async function worker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= count) {
        return;
      }

      const idempotencyKey = `stress-${count}-${index + 1}-${startedAt}`;
      try {
        const response = await requestJson('/api/waybills', {
          method: 'POST',
          headers: { 'x-idempotency-key': idempotencyKey },
          body: JSON.stringify(createPayload()),
        });

        results[index] = {
          status: response.status,
          body: response.body,
          instanceId: response.headers.get('x-instance-id'),
        };
      } catch (error) {
        results[index] = {
          status: 'NETWORK_ERROR',
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: count }, () => worker()));

  return {
    durationMs: Date.now() - startedAt,
    results,
  };
}

async function runPhase(connection, count) {
  await cleanupVehicle();
  const before = await collectDbMetrics(connection, null);
  const run = await runConcurrentCreates(count);

  const responseCounts = run.results.reduce(
    (acc, item) => {
      if (item.status === 201) acc.created += 1;
      else if (item.status === 409) acc.conflict += 1;
      else if (item.status === 400) acc.badRequest += 1;
      else if (item.status === 500) acc.serverError += 1;
      else if (item.status === 'NETWORK_ERROR') acc.networkError += 1;
      else acc.other += 1;
      return acc;
    },
    { created: 0, conflict: 0, badRequest: 0, serverError: 0, networkError: 0, other: 0 },
  );

  const success = run.results.find((item) => item.status === 201);
  const createdWaybillNo = success?.body?.waybillNo ?? null;
  const after = await collectDbMetrics(connection, createdWaybillNo);

  if (createdWaybillNo) {
    await requestJson(`/api/waybills/${success.body.id}/sign`, {
      method: 'POST',
      headers: { 'x-idempotency-key': `cleanup-sign-${createdWaybillNo}-${Date.now()}` },
      body: '{}',
    });
    await requestJson(`/api/waybills/${success.body.id}/upload-pod`, {
      method: 'POST',
      headers: { 'x-idempotency-key': `cleanup-pod-${createdWaybillNo}-${Date.now()}` },
      body: '{}',
    });
  }

  return {
    totalRequests: count,
    durationMs: run.durationMs,
    responseCounts,
    successWaybillNo: createdWaybillNo,
    before,
    after,
    successResponses: run.results.filter((item) => item.status === 201).map((item) => item.body?.waybillNo).filter(Boolean),
    nonSuccessSamples: run.results
      .filter((item) => item.status !== 201)
      .slice(0, 3),
  };
}

async function main() {
  const connection = await mysql.createConnection(dbConfig);
  try {
    const results = [];
    for (const count of [50, 200]) {
      results.push({
        concurrency: count,
        summary: await runPhase(connection, count),
      });
    }
    const payload = {
      baseUrl,
      vehicleId,
      db: dbConfig.database,
      results,
    };

    console.log(JSON.stringify(payload, null, 2));

    const failures = results.some(({ summary }) => {
      const { responseCounts, before, after, successWaybillNo } = summary;
      const expectedSuccess = 1;
      const expectedConflicts = summary.totalRequests - expectedSuccess;
      const hasBadStatuses = responseCounts.created !== expectedSuccess || responseCounts.conflict !== expectedConflicts || responseCounts.badRequest !== 0 || responseCounts.serverError !== 0 || responseCounts.networkError !== 0 || responseCounts.other !== 0;
      const hasDbMismatch = after.totalCount - before.totalCount !== expectedSuccess || after.activeCount !== 1;
      const hasFeeMismatch = !successWaybillNo || after.feeRows !== 5 || after.distinctFeeTypes !== 5 || after.operationCount !== 1;
      return hasBadStatuses || hasDbMismatch || hasFeeMismatch;
    });

    if (failures) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

await main();
