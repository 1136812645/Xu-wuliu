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
const shipperId = process.env.SHIPPER_ID ?? 'shipper-2';
const carrierId = process.env.CARRIER_ID ?? 'carrier-2';
const concurrency = Number(process.env.CONCURRENCY ?? 50);
const totalRequests = Number(process.env.TOTAL_REQUESTS ?? concurrency);

const activeStatuses = new Set(['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED']);
const shardTables = ['waybill_202607_0', 'waybill_202607_1', 'waybill_202607_2', 'waybill_202607_3'];

function createPayload() {
  return {
    shipperId,
    carrierId,
    vehicleId,
    mileageKm: 80,
    weightKg: 1000,
    volumeM3: 3,
    goodsName: 'concurrency-check-goods',
    extraLoadingFee: 0,
    subsidy: 0,
    deduction: 0,
  };
}

async function devLogin(role, email, name) {
  const password = process.env.DEV_LOGIN_PASSWORD ?? '123456';
  const response = await requestJson('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ role, email, name, password }),
  });

  if (response.status !== 200 || !response.body?.token) {
    throw new Error(`dev-login failed for role=${role}, status=${response.status}`);
  }
  return response.body.token;
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
        ...(options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
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

async function cleanupVehicle(adminToken, carrierToken) {
  const list = await requestJson('/api/waybills', { method: 'GET', authToken: adminToken });
  const items = Array.isArray(list.body?.items) ? list.body.items : [];
  const active = items.filter((item) => item.vehicleId === vehicleId && activeStatuses.has(item.status));

  for (const item of active) {
    if (item.status !== 'SIGNED' && item.status !== 'POD_UPLOADED') {
      await requestJson(`/api/waybills/${item.id}/sign`, {
        method: 'POST',
        authToken: adminToken,
        headers: { 'x-idempotency-key': `cleanup-sign-${item.id}-${Date.now()}` },
        body: '{}',
      });
    }

    await requestJson(`/api/waybills/${item.id}/upload-pod`, {
      method: 'POST',
      authToken: carrierToken,
      headers: { 'x-idempotency-key': `cleanup-pod-${item.id}-${Date.now()}` },
      body: '{}',
    });
  }
}

async function collectDbMetrics(connection, createdWaybillNo, successWaybillNos = []) {
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

  let feeConsistency = {
    checkedWaybills: successWaybillNos.length,
    waybillsWithExpectedFeeRows: 0,
    waybillsWithExpectedFeeTypes: 0,
    waybillsWithSingleCreateOperation: 0,
  };

  if (successWaybillNos.length > 0) {
    const placeholders = successWaybillNos.map(() => '?').join(',');
    const [feeConsistencyRows] = await connection.query(
      `SELECT
        waybill_no,
        COUNT(*) AS fee_rows,
        COUNT(DISTINCT fee_type) AS fee_types,
        SUM(CASE WHEN fee_type = 'DEDUCTION' THEN 1 ELSE 0 END) AS deduction_rows
       FROM waybill_fee_detail
       WHERE waybill_no IN (${placeholders})
       GROUP BY waybill_no`,
      successWaybillNos,
    );

    const [operationConsistencyRows] = await connection.query(
      `SELECT
        waybill_no,
        COUNT(*) AS create_rows
       FROM waybill_operation_log
       WHERE waybill_no IN (${placeholders})
         AND operation_type = 'CREATE'
       GROUP BY waybill_no`,
      successWaybillNos,
    );

    const feeMap = new Map(
      feeConsistencyRows.map((row) => [
        row.waybill_no,
        {
          feeRows: Number(row.fee_rows),
          feeTypes: Number(row.fee_types),
          deductionRows: Number(row.deduction_rows),
        },
      ]),
    );

    const operationMap = new Map(operationConsistencyRows.map((row) => [row.waybill_no, Number(row.create_rows)]));

    for (const no of successWaybillNos) {
      const fee = feeMap.get(no);
      const createRows = operationMap.get(no) ?? 0;
      if (fee?.feeRows === 5 && fee?.deductionRows === 1) {
        feeConsistency.waybillsWithExpectedFeeRows += 1;
      }
      if (fee?.feeTypes === 5) {
        feeConsistency.waybillsWithExpectedFeeTypes += 1;
      }
      if (createRows === 1) {
        feeConsistency.waybillsWithSingleCreateOperation += 1;
      }
    }
  }

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
    feeConsistency,
  };
}

async function runConcurrentCreates(count, adminToken) {
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
          authToken: adminToken,
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

async function runPhase(connection, count, adminToken, carrierToken) {
  await cleanupVehicle(adminToken, carrierToken);
  const before = await collectDbMetrics(connection, null, []);
  const beforeApi = await requestJson('/api/waybills', { method: 'GET', authToken: adminToken });
  const beforeItems = Array.isArray(beforeApi.body?.items) ? beforeApi.body.items : [];
  const beforeActiveCountApi = beforeItems.filter((item) => item.vehicleId === vehicleId && activeStatuses.has(item.status)).length;
  const run = await runConcurrentCreates(count, adminToken);

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
  const successWaybillNos = run.results.filter((item) => item.status === 201).map((item) => item.body?.waybillNo).filter(Boolean);
  const createdWaybillNo = success?.body?.waybillNo ?? null;
  const after = await collectDbMetrics(connection, createdWaybillNo, successWaybillNos);
  const afterApi = await requestJson('/api/waybills', { method: 'GET', authToken: adminToken });
  const afterItems = Array.isArray(afterApi.body?.items) ? afterApi.body.items : [];
  const afterActiveCountApi = afterItems.filter((item) => item.vehicleId === vehicleId && activeStatuses.has(item.status)).length;
  const createdExistsInApi = createdWaybillNo
    ? afterItems.some((item) => item.waybillNo === createdWaybillNo)
    : false;

  if (createdWaybillNo) {
    await requestJson(`/api/waybills/${success.body.id}/sign`, {
      method: 'POST',
      authToken: adminToken,
      headers: { 'x-idempotency-key': `cleanup-sign-${createdWaybillNo}-${Date.now()}` },
      body: '{}',
    });
    await requestJson(`/api/waybills/${success.body.id}/upload-pod`, {
      method: 'POST',
      authToken: carrierToken,
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
    beforeActiveCountApi,
    afterActiveCountApi,
    createdExistsInApi,
    successResponses: successWaybillNos,
    nonSuccessSamples: run.results
      .filter((item) => item.status !== 201)
      .slice(0, 3),
  };
}

async function main() {
  const adminToken = await devLogin('ADMIN', 'admin@example.com', 'Admin User');
  const carrierToken = await devLogin('CARRIER', 'carrier@example.com', 'Carrier User');
  const connection = await mysql.createConnection(dbConfig);
  try {
    const results = [];
    for (const count of [50, 100, 200]) {
      results.push({
        concurrency: count,
        summary: await runPhase(connection, count, adminToken, carrierToken),
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
      const { responseCounts, before, after, successWaybillNo, beforeActiveCountApi, afterActiveCountApi, createdExistsInApi } = summary;
      const createdDelta = after.totalCount - before.totalCount;
      const hasBadStatuses = responseCounts.serverError !== 0 || responseCounts.networkError !== 0 || responseCounts.other !== 0;
      const hasDuplicateCreate = responseCounts.created > 1 || createdDelta > 1;
      const hasActiveOccupationAnomaly = after.activeCount > 1 || afterActiveCountApi > 1;
      const hasFeeMismatch = successWaybillNo
        ? (!createdExistsInApi || (after.feeRows > 0 && (after.feeRows !== 5 || after.distinctFeeTypes !== 5 || after.operationCount !== 1)))
        : false;
      const hasBatchFeeMismatch =
        after.feeConsistency.checkedWaybills !== after.feeConsistency.waybillsWithExpectedFeeRows ||
        after.feeConsistency.checkedWaybills !== after.feeConsistency.waybillsWithExpectedFeeTypes ||
        after.feeConsistency.checkedWaybills !== after.feeConsistency.waybillsWithSingleCreateOperation;
      const hasNoResponse = responseCounts.created + responseCounts.conflict + responseCounts.badRequest <= 0;
      const hasDeltaMismatch = before.totalCount > 0 || after.totalCount > 0
        ? responseCounts.created !== createdDelta
        : false;
      const hasApiOccupationMismatch = responseCounts.created === 1 && !(beforeActiveCountApi === 0 && afterActiveCountApi === 1);
      return (
        hasBadStatuses ||
        hasDuplicateCreate ||
        hasActiveOccupationAnomaly ||
        hasFeeMismatch ||
        hasBatchFeeMismatch ||
        hasNoResponse ||
        hasDeltaMismatch ||
        hasApiOccupationMismatch
      );
    });

    if (failures) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

await main();
