import { createReadStream, createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import readline from 'node:readline';

type ImportRow = {
  shipperId: string;
  carrierId: string;
  vehicleId: string;
  mileageKm: number;
  weightKg: number;
  volumeM3: number;
  goodsName: string;
  extraLoadingFee: number;
  subsidy: number;
  deduction: number;
  idempotencyKey: string;
};

type ChunkResult = {
  importBatchId: string;
  chunkSize: number;
  created: number;
  failed: number;
  durationMs: number;
  heapBeforeMB: number;
  heapAfterMB: number;
  heapDeltaMB: number;
  storage: 'mysql-sharded' | 'memory';
  errors?: string[];
};

const TOTAL_ROWS = Number(process.env.IMPORT_TOTAL ?? 10000);
const CHUNK_SIZE = Number(process.env.IMPORT_CHUNK_SIZE ?? 200);
const API_BASE = process.env.IMPORT_API_BASE ?? 'http://127.0.0.1:3100';
const TEMPLATE_PATH = resolve(process.cwd(), 'scripts', 'data', `waybill-import-template-${TOTAL_ROWS}.csv`);

function ensureDir(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

async function buildCsvTemplate(filePath: string, totalRows: number): Promise<void> {
  ensureDir(filePath);
  const stream = createWriteStream(filePath, { encoding: 'utf-8' });
  stream.write('shipperId,carrierId,vehicleId,mileageKm,weightKg,volumeM3,goodsName,extraLoadingFee,subsidy,deduction,idempotencyKey\n');

  for (let i = 1; i <= totalRows; i += 1) {
    const line = [
      'shipper-1',
      'carrier-1',
      'vehicle-1',
      '320',
      '3000',
      '10',
      `bulk-import-${i}`,
      '20',
      '0',
      '0',
      `bulk-import-idem-${i}`,
    ].join(',');
    stream.write(`${line}\n`);
  }

  await new Promise<void>((resolveDone, rejectDone) => {
    stream.end(() => resolveDone());
    stream.on('error', rejectDone);
  });
}

function parseCsvLine(line: string): ImportRow {
  const [
    shipperId,
    carrierId,
    vehicleId,
    mileageKm,
    weightKg,
    volumeM3,
    goodsName,
    extraLoadingFee,
    subsidy,
    deduction,
    idempotencyKey,
  ] = line.split(',');

  return {
    shipperId,
    carrierId,
    vehicleId,
    mileageKm: Number(mileageKm),
    weightKg: Number(weightKg),
    volumeM3: Number(volumeM3),
    goodsName,
    extraLoadingFee: Number(extraLoadingFee),
    subsidy: Number(subsidy),
    deduction: Number(deduction),
    idempotencyKey,
  };
}

async function sendChunk(importBatchId: string, rows: ImportRow[]): Promise<ChunkResult> {
  const response = await fetch(`${API_BASE}/api/waybills/import/chunk`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ importBatchId, rows }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Chunk import failed: ${response.status} ${text}`);
  }

  return (await response.json()) as ChunkResult;
}

async function main(): Promise<void> {
  await buildCsvTemplate(TEMPLATE_PATH, TOTAL_ROWS);

  const importBatchId = `perf-stream-${Date.now()}`;
  const checkpoint: Array<{ chunk: number; imported: number; heapAfterMB: number; durationMs: number }> = [];

  let imported = 0;
  let failed = 0;
  let chunkCount = 0;
  let peakHeapAfterMB = 0;
  let storage: 'mysql-sharded' | 'memory' = 'memory';

  const start = performance.now();
  const rl = readline.createInterface({
    input: createReadStream(TEMPLATE_PATH, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let buffer: ImportRow[] = [];
  let lineNumber = 0;

  for await (const line of rl) {
    lineNumber += 1;
    if (lineNumber === 1) {
      continue;
    }
    if (!line.trim()) {
      continue;
    }

    buffer.push(parseCsvLine(line));

    if (buffer.length >= CHUNK_SIZE) {
      chunkCount += 1;
      const result = await sendChunk(importBatchId, buffer);
      imported += result.created;
      failed += result.failed;
      storage = result.storage;
      peakHeapAfterMB = Math.max(peakHeapAfterMB, result.heapAfterMB);
      checkpoint.push({
        chunk: chunkCount,
        imported,
        heapAfterMB: result.heapAfterMB,
        durationMs: result.durationMs,
      });
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    chunkCount += 1;
    const result = await sendChunk(importBatchId, buffer);
    imported += result.created;
    failed += result.failed;
    storage = result.storage;
    peakHeapAfterMB = Math.max(peakHeapAfterMB, result.heapAfterMB);
    checkpoint.push({
      chunk: chunkCount,
      imported,
      heapAfterMB: result.heapAfterMB,
      durationMs: result.durationMs,
    });
  }

  const durationSec = Math.round(((performance.now() - start) / 1000) * 100) / 100;

  console.log(
    JSON.stringify(
      {
        templatePath: TEMPLATE_PATH,
        importBatchId,
        totalRows: TOTAL_ROWS,
        chunkSize: CHUNK_SIZE,
        chunks: chunkCount,
        imported,
        failed,
        durationSec,
        peakHeapAfterMB,
        storage,
      },
      null,
      2,
    ),
  );
  console.table(checkpoint);
}

void main();
