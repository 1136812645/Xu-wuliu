import mysql from 'mysql2/promise';

const apiBase = process.env.BASE_URL ?? 'http://127.0.0.1:3100';
const dbConfig = {
  host: process.env.DB_HOST ?? '127.0.0.1',
  port: Number(process.env.DB_PORT ?? 13306),
  user: process.env.DB_USER ?? 'root',
  password: process.env.DB_PASSWORD ?? 'root',
  database: process.env.DB_NAME ?? 'waybill_admin',
};

const vehicleId = process.env.VEHICLE_ID ?? 'vehicle-3';
const shipperId = process.env.SHIPPER_ID ?? 'shipper-1';
const carrierId = process.env.CARRIER_ID ?? 'carrier-1';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { status: response.status, body };
}

async function devLogin(role, email, name) {
  const result = await request('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ role, email, name }),
  });
  assert(result.status === 200 && result.body?.token, `dev-login failed for ${role}`);
  return result.body.token;
}

async function createWaybillAndSign(adminToken) {
  const create = await request('/api/waybills', {
    method: 'POST',
    token: adminToken,
    headers: { 'x-idempotency-key': `fault-drill-create-${Date.now()}` },
    body: JSON.stringify({
      shipperId,
      carrierId,
      vehicleId,
      mileageKm: 120,
      weightKg: 1000,
      volumeM3: 4,
      goodsName: 'fault-drill-waybill',
      extraLoadingFee: 20,
      subsidy: 0,
      deduction: 0,
    }),
  });

  assert(create.status === 201, `create waybill failed: ${JSON.stringify(create.body)}`);
  const waybillId = create.body.id;
  const waybillNo = create.body.waybillNo;

  const sign = await request(`/api/waybills/${waybillId}/sign`, {
    method: 'POST',
    token: adminToken,
    headers: { 'x-idempotency-key': `fault-drill-sign-${Date.now()}` },
    body: '{}',
  });

  assert(sign.status === 200, `sign waybill failed: ${JSON.stringify(sign.body)}`);
  return { waybillId, waybillNo };
}

async function cleanupVehicle(adminToken, carrierToken) {
  const list = await request('/api/waybills', { method: 'GET', token: adminToken });
  const items = Array.isArray(list.body?.items) ? list.body.items : [];
  const active = items.filter(
    (item) =>
      item.vehicleId === vehicleId &&
      ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'SIGNED'].includes(item.status),
  );

  for (const item of active) {
    if (item.status !== 'SIGNED' && item.status !== 'POD_UPLOADED') {
      await request(`/api/waybills/${item.id}/sign`, {
        method: 'POST',
        token: adminToken,
        headers: { 'x-idempotency-key': `fault-clean-sign-${item.id}-${Date.now()}` },
        body: '{}',
      });
    }

    await request(`/api/waybills/${item.id}/upload-pod`, {
      method: 'POST',
      token: carrierToken,
      headers: { 'x-idempotency-key': `fault-clean-pod-${item.id}-${Date.now()}` },
      body: '{}',
    });
  }
}

async function main() {
  const adminToken = await devLogin('ADMIN', 'admin@example.com', 'Fault Drill Admin');
  const carrierToken = await devLogin('CARRIER', 'carrier@example.com', 'Fault Drill Carrier');
  const connection = await mysql.createConnection(dbConfig);

  const output = {
    apiBase,
    db: dbConfig.database,
    scenario: 'dirty-data-and-mq-fault-drill',
    steps: {},
  };

  try {
    await cleanupVehicle(adminToken, carrierToken);

    const mqBefore = await request('/api/mq/status', { method: 'GET', token: adminToken });
    output.steps.mqBaseline = mqBefore.body;

    const { waybillId, waybillNo } = await createWaybillAndSign(adminToken);
    output.steps.sampleWaybill = { waybillId, waybillNo };

    // Dirty data 1: duplicate sign insertion
    const duplicateKey = `manual-dup-sign-${Date.now()}`;
    let duplicateError = null;
    try {
      await connection.query(
        `INSERT INTO waybill_operation_log (waybill_no, operation_type, idempotency_key, operation_result)
         VALUES (?, 'SIGN', ?, JSON_OBJECT('status','SIGNED'))`,
        [waybillNo, duplicateKey],
      );
    } catch (error) {
      duplicateError = {
        code: error?.code ?? 'UNKNOWN',
        message: error?.message ?? String(error),
      };
    }
    assert(duplicateError?.code === 'ER_DUP_ENTRY', 'Expected duplicate sign insertion to be blocked by unique key.');
    output.steps.duplicateSignInjection = {
      duplicateError,
      reasonHint: 'Unique key uk_waybill_operation blocked duplicate SIGN operation.',
    };

    // Dirty data 2: corrupt fee amount then detect and repair
    const [feeRows] = await connection.query(
      `SELECT id, amount FROM waybill_fee_detail WHERE waybill_no = ? AND fee_type = 'LINE_HAUL' LIMIT 1`,
      [waybillNo],
    );
    assert(feeRows.length === 1, 'LINE_HAUL fee row not found.');
    const feeId = feeRows[0].id;
    const originalAmount = Number(feeRows[0].amount);

    await connection.query(`UPDATE waybill_fee_detail SET amount = amount + 9999 WHERE id = ?`, [feeId]);

    const diagnosticsAfterCorrupt = await request('/api/faults/diagnostics', { method: 'GET', token: adminToken });
    assert(diagnosticsAfterCorrupt.status === 200, 'fault diagnostics endpoint failed after fee corruption.');
    const mismatchCountAfterCorrupt = Number(diagnosticsAfterCorrupt.body?.reasons?.feeMismatch?.count ?? 0);
    assert(mismatchCountAfterCorrupt > 0, 'Expected fee mismatch diagnostics to detect corrupted amount.');

    await connection.query(`UPDATE waybill_fee_detail SET amount = ? WHERE id = ?`, [originalAmount, feeId]);

    const diagnosticsAfterRepair = await request('/api/faults/diagnostics', { method: 'GET', token: adminToken });
    assert(diagnosticsAfterRepair.status === 200, 'fault diagnostics endpoint failed after fee repair.');

    output.steps.feeCorruptionAndRepair = {
      feeId,
      originalAmount,
      mismatchCountAfterCorrupt,
      mismatchCountAfterRepair: Number(diagnosticsAfterRepair.body?.reasons?.feeMismatch?.count ?? 0),
      reasonHint: 'Detected by diagnostics: waybill_total != SUM(fee_detail).',
    };

    // Release the first sample waybill so MQ-fault create can run on the same vehicle.
    await request(`/api/waybills/${waybillId}/upload-pod`, {
      method: 'POST',
      token: carrierToken,
      headers: { 'x-idempotency-key': `fault-drill-pod-${Date.now()}` },
      body: '{}',
    });

    // MQ fault 1: queue unavailable (or disconnected baseline) then create and observe outbox fallback
    const createWhenMqFault = await request('/api/waybills', {
      method: 'POST',
      token: adminToken,
      headers: { 'x-idempotency-key': `fault-drill-mq-create-${Date.now()}` },
      body: JSON.stringify({
        shipperId,
        carrierId,
        vehicleId,
        mileageKm: 80,
        weightKg: 1000,
        volumeM3: 3,
        goodsName: 'mq-fault-waybill',
        extraLoadingFee: 0,
        subsidy: 0,
        deduction: 0,
      }),
    });

    assert(createWhenMqFault.status === 201, `create in MQ fault scenario failed: ${JSON.stringify(createWhenMqFault.body)}`);
    const mqAfterCreate = await request('/api/mq/status', { method: 'GET', token: adminToken });

    output.steps.mqQueueDownOrUnavailable = {
      connectedBefore: Boolean(mqBefore.body?.connected),
      connectedAfterCreate: Boolean(mqAfterCreate.body?.connected),
      publishFailedAfterCreate: Number(mqAfterCreate.body?.stats?.publishFailed ?? 0),
      outboxSizeAfterCreate: Number(mqAfterCreate.body?.outbox?.size ?? 0),
      reasonHint:
        'When MQ is unavailable, event should be persisted to outbox and business create still succeeds.',
    };

    // MQ fault 2: illegal payload injection and repair
    const illegalEventId = `manual-illegal-${Date.now()}`;
    await connection.query(
      `INSERT INTO outbox_event (event_id, event_type, business_key, payload, publish_status, retry_count)
       VALUES (?, 'WAYBILL_STATUS_CHANGED', ?, JSON_OBJECT('foo','bar'), 'NEW', 0)`,
      [illegalEventId, `BK-${illegalEventId}`],
    );

    const diagnosticsAfterIllegal = await request('/api/faults/diagnostics', { method: 'GET', token: adminToken });
    assert(diagnosticsAfterIllegal.status === 200, 'fault diagnostics endpoint failed after illegal payload injection.');
    const illegalCountAfterInject = Number(diagnosticsAfterIllegal.body?.reasons?.illegalOutboxPayload?.count ?? 0);
    assert(illegalCountAfterInject > 0, 'Expected illegal outbox payload to be detected.');

    await connection.query(
      `UPDATE outbox_event
       SET payload = JSON_OBJECT(
         'eventId', ?,
         'eventType', 'WAYBILL_STATUS_CHANGED',
         'occurredAt', NOW(),
         'waybillId', ?,
         'waybillNo', ?,
         'status', 'ASSIGNED',
         'operation', 'CREATE',
         'shardTable', 'waybill_202607_1'
       ),
       publish_status = 'NEW',
       retry_count = 0
       WHERE event_id = ?`,
      [illegalEventId, createWhenMqFault.body.id, createWhenMqFault.body.waybillNo, illegalEventId],
    );

    const diagnosticsAfterIllegalRepair = await request('/api/faults/diagnostics', { method: 'GET', token: adminToken });
    assert(diagnosticsAfterIllegalRepair.status === 200, 'fault diagnostics endpoint failed after illegal payload repair.');

    const flush = await request('/api/mq/outbox/flush', {
      method: 'POST',
      token: adminToken,
      body: '{}',
    });

    output.steps.mqIllegalPayloadRepairAndReplay = {
      illegalEventId,
      illegalCountAfterInject,
      illegalCountAfterRepair: Number(diagnosticsAfterIllegalRepair.body?.reasons?.illegalOutboxPayload?.count ?? 0),
      flushResult: flush.body,
      reasonHint: 'Repaired payload fields eventId/waybillNo/operation then replayed with flush.',
    };

    console.log(JSON.stringify(output, null, 2));
  } finally {
    await connection.end();
  }
}

await main();
