import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import {
  buildDashboardSummary,
  buildSplitPlan,
  buildDocumentWarnings,
  calculateFees,
  createWaybill,
  getReferenceData,
  getRolePermissions,
  getStatusFlow,
  listPricingRules,
  seedDemoWaybills,
  transitionWaybill,
  upsertPricingRule,
  validateCapacity,
} from './logic.js';
import { initializeDb, isDbEnabled } from './db.js';
import {
  buildWaybillEvent,
  flushOutbox,
  getMqRuntimeStatus,
  publishWaybillEvent,
  startWaybillConsumer,
} from './mq.js';
import { idempotencyStore, vehicles, waybills } from './data.js';
import {
  createWaybillInDb,
  listPricingRulesFromDb,
  replacePricingRulesFromDb,
  findCreateWaybillByIdempotencyKeyInDb,
  findWaybillInDb,
  hasActiveWaybillForVehicleInDb,
  listRecentWaybillsFromDb,
  transitionWaybillInDb,
} from './waybill-repository.js';
import { acquireDistributedLock } from './redis-lock.js';
import {
  cacheHasKey,
  cacheDelete,
  getIdempotencySnapshot,
  rememberJson,
  setIdempotencySnapshot,
} from './redis-cache.js';
import * as logger from './logger.js';

seedDemoWaybills();

const instanceId = process.env.INSTANCE_ID ?? `api-${process.pid}`;

const app = express();
app.use(cors());
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader('x-instance-id', instanceId);
  next();
});
app.use((req, _res, next) => {
  logger.info('request.received', {
    method: req.method,
    path: req.path,
    instanceId,
  });
  next();
});

const waybillDraftSchema = z.object({
  shipperId: z.string().min(1),
  carrierId: z.string().min(1),
  vehicleId: z.string().min(1),
  mileageKm: z.number().min(0),
  weightKg: z.number().min(0),
  volumeM3: z.number().min(0),
  goodsName: z.string(),
  extraLoadingFee: z.number(),
  subsidy: z.number(),
  deduction: z.number(),
});

const pricingRuleSchema = z.object({
  shipperId: z.string().min(1),
  truckType: z.enum(['4.2M', '6.8M', '9.6M', '17.5M']),
  minMileageKm: z.number().min(0),
  maxMileageKm: z.number().min(0),
  unitPricePerKm: z.number().min(0),
  loadingFee: z.number(),
  insuranceRate: z.number().min(0),
  index: z.number().int().min(0).optional(),
});

function getIdempotencyKey(req: express.Request): string | undefined {
  return req.header('x-idempotency-key') ?? (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : undefined);
}

function requireIdempotencyKey(req: express.Request, res: express.Response): string | null {
  const key = getIdempotencyKey(req);
  if (!key) {
    res.status(400).json({
      message: 'Missing idempotency key. Provide x-idempotency-key header or idempotencyKey in request body.',
    });
    return null;
  }
  return key;
}

function hasActiveWaybillForVehicleInMemory(vehicleId: string): boolean {
  return waybills.some(
    (item) =>
      item.vehicleId === vehicleId &&
      (item.status === 'ASSIGNED' || item.status === 'PICKED_UP' || item.status === 'IN_TRANSIT' || item.status === 'SIGNED'),
  );
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'waybill-api', instanceId });
});

app.get('/api/ha/instance', (_req, res) => {
  res.json({ instanceId, status: 'running' });
});

app.get('/api/bootstrap', (_req, res) => {
  void rememberJson('cache:bootstrap:v1', 30 * 60, () => ({
    system: {
      name: 'Waybill & Settlement Admin',
      locales: ['zh-CN', 'en-US'],
      auth: ['Google OAuth2', 'RBAC'],
      infra: ['MySQL Sharding', 'Redis', 'RabbitMQ', 'Docker Compose', 'Nginx'],
    },
    permissions: getRolePermissions(),
    statusFlow: getStatusFlow(),
    references: getReferenceData(),
  }))
    .then(({ value, hit }) => {
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/dashboard', (_req, res) => {
  void rememberJson('cache:dashboard:v1', 20, () => buildDashboardSummary())
    .then(({ value, hit }) => {
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/waybills', async (_req, res) => {
  if (!isDbEnabled()) {
    return res.json({ items: waybills, storage: 'memory' });
  }

  try {
    const { value, hit } = await rememberJson('cache:waybills:recent:50', 15, async () => listRecentWaybillsFromDb(50));
    res.setHeader('x-cache-hit', hit ? '1' : '0');
    return res.json({ items: value, storage: 'mysql-sharded' });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/warnings', (_req, res) => {
  res.json({ items: buildDocumentWarnings() });
});

app.get('/api/pricing-rules', async (_req, res) => {
  try {
    if (isDbEnabled()) {
      const rows = await listPricingRulesFromDb();
      return res.json({ source: 'mysql', items: rows });
    }
    return res.json({ source: 'memory', items: listPricingRules() });
  } catch (error) {
    logger.error('pricing_rules.list_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/pricing-rules/reload', async (_req, res) => {
  if (!isDbEnabled()) {
    return res.status(400).json({ message: 'Database is not enabled.' });
  }

  try {
    const rules = await replacePricingRulesFromDb();
    logger.info('pricing_rules.reloaded', { count: rules.length });
    return res.json({ source: 'mysql', count: rules.length, items: rules });
  } catch (error) {
    logger.error('pricing_rules.reload_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/pricing-rules', async (req, res) => {
  const parsed = pricingRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid pricing rule payload.', issues: parsed.error.issues });
  }

  const { index, ...rule } = parsed.data;

  try {
    const rules = upsertPricingRule(rule, index);
    logger.info('pricing_rules.upserted', {
      count: rules.length,
      index: typeof index === 'number' ? index : null,
    });
    return res.status(201).json({ source: 'memory', count: rules.length, items: rules });
  } catch (error) {
    logger.error('pricing_rules.upsert_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/mq/status', (_req, res) => {
  res.json(getMqRuntimeStatus());
});

app.post('/api/mq/outbox/flush', async (_req, res) => {
  const result = await flushOutbox();
  res.json(result);
});

app.get('/api/cache/status', async (_req, res) => {
  const [bootstrap, dashboard, recentWaybills] = await Promise.all([
    cacheHasKey('cache:bootstrap:v1'),
    cacheHasKey('cache:dashboard:v1'),
    cacheHasKey('cache:waybills:recent:50'),
  ]);

  res.json({
    keys: {
      'cache:bootstrap:v1': bootstrap,
      'cache:dashboard:v1': dashboard,
      'cache:waybills:recent:50': recentWaybills,
    },
  });
});

async function invalidateHotCaches(): Promise<void> {
  await Promise.all([
    cacheDelete('cache:dashboard:v1'),
    cacheDelete('cache:waybills:recent:50'),
  ]);
}

app.post('/api/waybills/quote', (req, res) => {
  const parsed = waybillDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid draft payload.', issues: parsed.error.issues });
  }

  try {
    const vehicle = vehicles.find((item) => item.id === parsed.data.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found.' });
    }
    const capacity = validateCapacity(parsed.data, vehicle);
    const fee = calculateFees(parsed.data);
    return res.json({ capacity, fee });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/waybills', async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) {
    return;
  }

  const idemSnapshot = await getIdempotencySnapshot<unknown>(idempotencyKey);
  if (idemSnapshot) {
    return res.status(200).json(idemSnapshot);
  }

  const parsed = waybillDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid draft payload.', issues: parsed.error.issues });
  }

  try {
    // Lock + occupation check together prevent concurrent duplicate occupation of one vehicle.
    const vehicleLockKey = `lock:create-waybill:${parsed.data.shipperId}:${parsed.data.vehicleId}`;
    const lock = await acquireDistributedLock(vehicleLockKey, {
      ttlMs: 8000,
      waitTimeoutMs: 2000,
      retryIntervalMs: 80,
    });
    if (!lock.acquired) {
      return res.status(409).json({
        message: 'Concurrent create waybill request detected. Please retry later.',
        lockKey: vehicleLockKey,
      });
    }

    try {
      const occupied = isDbEnabled()
        ? await hasActiveWaybillForVehicleInDb(parsed.data.vehicleId)
        : hasActiveWaybillForVehicleInMemory(parsed.data.vehicleId);
      if (occupied) {
        return res.status(409).json({
          message: 'Vehicle is already occupied by an active waybill.',
          vehicleId: parsed.data.vehicleId,
        });
      }

    const splitPlan = buildSplitPlan(parsed.data);

    const createOne = async (draft: typeof parsed.data, key: string) => {
      const existedBeforeCreate = isDbEnabled()
        ? await findCreateWaybillByIdempotencyKeyInDb(key)
        : idempotencyStore.has(key);

      const waybill = isDbEnabled()
        ? await createWaybillInDb(draft, key)
        : createWaybill(draft, key);

      if (!existedBeforeCreate) {
        const mqResult = await publishWaybillEvent(
          buildWaybillEvent({
            waybillId: waybill.id,
            waybillNo: waybill.waybillNo,
            status: waybill.status,
            operation: 'CREATE',
            shardTable: waybill.shardTable,
          }),
        );
        if (mqResult.persistedToOutbox) {
          console.warn(`[MQ] event persisted to outbox for waybill=${waybill.waybillNo}`);
        }
      }

      return waybill;
    };

    if (!splitPlan.splitRequired) {
      const waybill = await createOne(parsed.data, idempotencyKey);
      await invalidateHotCaches();
      await setIdempotencySnapshot(idempotencyKey, waybill);
      logger.info('waybill.created', {
        idempotencyKey,
        waybillNo: waybill.waybillNo,
        splitApplied: false,
      });
      return res.status(201).json(waybill);
    }

    const created = [];
    for (let i = 0; i < splitPlan.childDrafts.length; i += 1) {
      const childKey = `${idempotencyKey}:split:${i + 1}`;
      const child = await createOne(splitPlan.childDrafts[i], childKey);
      created.push(child);
    }

    const result = {
      splitApplied: true,
      splitCount: splitPlan.suggestedSplitCount,
      overweightKg: splitPlan.overweightKg,
      overVolumeM3: splitPlan.overVolumeM3,
      items: created,
    };
    await invalidateHotCaches();
    await setIdempotencySnapshot(idempotencyKey, result);
    logger.info('waybill.created', {
      idempotencyKey,
      splitApplied: true,
      splitCount: result.splitCount,
    });
    return res.status(201).json(result);
    } finally {
      await lock.release();
    }
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/waybills/:id/sign', async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) {
    return;
  }

  const idemSnapshot = await getIdempotencySnapshot<unknown>(idempotencyKey);
  if (idemSnapshot) {
    return res.status(200).json({
      idempotentBlocked: true,
      reason: 'IDEMPOTENCY_KEY_HIT',
      message: 'Duplicate SIGN request was blocked by idempotency key.',
      data: idemSnapshot,
    });
  }

  try {
    const before = isDbEnabled()
      ? await findWaybillInDb(req.params.id)
      : waybills.find((item) => item.id === req.params.id);
    const wasSignedOrDone = before ? before.status === 'SIGNED' || before.status === 'POD_UPLOADED' : false;

    const waybill = isDbEnabled()
      ? await transitionWaybillInDb(req.params.id, 'SIGN', idempotencyKey)
      : transitionWaybill(req.params.id, 'SIGN', idempotencyKey);

    const shouldPublish = !wasSignedOrDone;
    if (shouldPublish) {
      const mqResult = await publishWaybillEvent(
        buildWaybillEvent({
          waybillId: waybill.id,
          waybillNo: waybill.waybillNo,
          status: waybill.status,
          operation: 'SIGN',
          shardTable: waybill.shardTable,
        }),
      );
      if (mqResult.persistedToOutbox) {
        console.warn(`[MQ] event persisted to outbox for waybill=${waybill.waybillNo}`);
      }
    }

    await invalidateHotCaches();
    await setIdempotencySnapshot(idempotencyKey, waybill);
    logger.info('waybill.signed', {
      idempotencyKey,
      waybillNo: waybill.waybillNo,
    });

    if (wasSignedOrDone) {
      return res.status(200).json({
        idempotentBlocked: true,
        reason: 'ALREADY_SIGNED',
        message: 'Duplicate SIGN operation was ignored because waybill is already signed.',
        data: waybill,
      });
    }

    return res.json(waybill);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/waybills/:id/upload-pod', async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) {
    return;
  }

  const idemSnapshot = await getIdempotencySnapshot<unknown>(idempotencyKey);
  if (idemSnapshot) {
    return res.status(200).json({
      idempotentBlocked: true,
      reason: 'IDEMPOTENCY_KEY_HIT',
      message: 'Duplicate UPLOAD_POD request was blocked by idempotency key.',
      data: idemSnapshot,
    });
  }

  try {
    const before = isDbEnabled()
      ? await findWaybillInDb(req.params.id)
      : waybills.find((item) => item.id === req.params.id);
    const wasPodUploaded = before ? before.podUploaded : false;

    const waybill = isDbEnabled()
      ? await transitionWaybillInDb(req.params.id, 'UPLOAD_POD', idempotencyKey)
      : transitionWaybill(req.params.id, 'UPLOAD_POD', idempotencyKey);

    const shouldPublish = !wasPodUploaded;
    if (shouldPublish) {
      const mqResult = await publishWaybillEvent(
        buildWaybillEvent({
          waybillId: waybill.id,
          waybillNo: waybill.waybillNo,
          status: waybill.status,
          operation: 'UPLOAD_POD',
          shardTable: waybill.shardTable,
        }),
      );
      if (mqResult.persistedToOutbox) {
        console.warn(`[MQ] event persisted to outbox for waybill=${waybill.waybillNo}`);
      }
    }

    await invalidateHotCaches();
    await setIdempotencySnapshot(idempotencyKey, waybill);
    logger.info('waybill.pod_uploaded', {
      idempotencyKey,
      waybillNo: waybill.waybillNo,
    });

    if (wasPodUploaded) {
      return res.status(200).json({
        idempotentBlocked: true,
        reason: 'ALREADY_POD_UPLOADED',
        message: 'Duplicate UPLOAD_POD operation was ignored because POD is already uploaded.',
        data: waybill,
      });
    }

    return res.json(waybill);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  logger.info('service.started', {
    url: `http://localhost:${port}`,
    instanceId,
  });
  void initializeDb().then((connected) => {
    if (connected) {
      logger.info('db.connected', { storage: 'mysql-sharded' });
      void replacePricingRulesFromDb()
        .then((rules) => {
          logger.info('pricing_rules.reloaded_on_boot', { count: rules.length });
        })
        .catch((error: unknown) => {
          logger.warn('pricing_rules.reload_on_boot_failed', {
            error: error instanceof Error ? error.message : 'unknown',
          });
        });
      return;
    }
    logger.warn('db.unavailable_fallback_memory', {});
  });
  void startWaybillConsumer();
});