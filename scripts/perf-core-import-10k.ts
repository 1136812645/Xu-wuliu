import { performance } from 'node:perf_hooks';
import { createWaybill, transitionWaybill } from '../apps/api/src/logic.js';
import { idempotencyStore, waybills } from '../apps/api/src/data.js';

const total = 10000;
const mem = () => Math.round(process.memoryUsage().heapUsed / 1024 / 1024 * 100) / 100;

const before = mem();
const checkpoints: Array<{ checkpoint: number; heapMB: number }> = [];
const start = performance.now();

let created = 0;
let signed = 0;
let podUploaded = 0;
let failed = 0;

for (let i = 1; i <= total; i += 1) {
  try {
    const draft = {
      shipperId: 'shipper-1',
      carrierId: 'carrier-1',
      vehicleId: 'vehicle-1',
      mileageKm: 10,
      weightKg: 1000,
      volumeM3: 3,
      goodsName: `core-bulk-${i}`,
      extraLoadingFee: 0,
      subsidy: 0,
      deduction: 0,
    };

    const ckey = `core-create-${i}`;
    const record = createWaybill(draft, ckey);
    created += 1;

    const skey = `core-sign-${i}`;
    transitionWaybill(record.id, 'SIGN', skey);
    signed += 1;

    const pkey = `core-pod-${i}`;
    transitionWaybill(record.id, 'UPLOAD_POD', pkey);
    podUploaded += 1;
  } catch {
    failed += 1;
  }

  if (i % 1000 === 0) {
    checkpoints.push({ checkpoint: i, heapMB: mem() });
  }
}

const durationSec = Math.round((performance.now() - start) / 10) / 100;
const after = mem();

console.log(
  JSON.stringify(
    {
      total,
      created,
      signed,
      podUploaded,
      failed,
      durationSec,
      heapBeforeMB: before,
      heapAfterMB: after,
      heapDeltaMB: Math.round((after - before) * 100) / 100,
      inMemoryWaybills: waybills.length,
      inMemoryIdempotencyKeys: idempotencyStore.size,
    },
    null,
    2,
  ),
);
console.table(checkpoints);
