import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { z } from 'zod';
import type { PricingRule } from './domain.js';
import {
  createPasswordUser,
  ensureAuthUserTable,
  findAuthUserByEmail,
  hashPassword,
  touchAuthUserLogin,
  upsertGoogleUser,
  verifyPassword,
  type UserRole,
} from './auth-repository.js';
import {
  buildDashboardSummary,
  buildSplitPlan,
  buildDocumentWarnings,
  calculateFees,
  createWaybill,
  deletePricingRule,
  deleteSettlementAdjustmentRule,
  getReferenceDataForPermissions,
  getRolePermissions,
  listSettlementAdjustmentRules,
  getStatusFlow,
  listPricingRules,
  seedDemoWaybills,
  transitionWaybill,
  upsertSettlementAdjustmentRule,
  upsertPricingRule,
  validateCapacity,
} from './logic.js';
import { dbQuery, initializeDb, isDbEnabled } from './db.js';
import {
  buildWaybillEvent,
  flushOutbox,
  getMqRuntimeStatus,
  publishWaybillEvent,
  startWaybillConsumer,
} from './mq.js';
import { carriers, drivers, idempotencyStore, shippers, vehicles, waybills } from './data.js';
import {
  createWaybillInDb,
  listPricingRulesFromDb,
  listSettlementAdjustmentRulesFromDb,
  replacePricingRulesFromDb,
  replaceSettlementAdjustmentRulesFromDb,
  findCreateWaybillByIdempotencyKeyInDb,
  findWaybillInDb,
  hasActiveWaybillForVehicleInDb,
  importWaybillChunkInDb,
  listRecentWaybillsFromDb,
  transitionWaybillInDb,
  deletePricingRuleInDb,
  deleteSettlementAdjustmentRuleInDb,
  upsertPricingRuleInDb,
  upsertSettlementAdjustmentRuleInDb,
} from './waybill-repository.js';
import { acquireDistributedLock } from './redis-lock.js';
import {
  cacheHasKey,
  cacheCountByPattern,
  cacheDelete,
  cacheScanKeys,
  getIdempotencySnapshot,
  rememberJson,
  rememberJsonNullable,
  setIdempotencySnapshot,
} from './redis-cache.js';
import * as logger from './logger.js';

type AuthUser = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  permissions: string[];
};

type SessionValue = {
  user: AuthUser;
  expiresAt: number;
};

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

const rolePermissions = getRolePermissions();
const sessions = new Map<string, SessionValue>();
const authClient = new OAuth2Client();
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
const devLoginEnabled = process.env.DEV_LOGIN_ENABLED !== '0';
const authSessionTtlMs = 8 * 60 * 60 * 1000;
const adminEmailSet = new Set(
  (process.env.GOOGLE_ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
const carrierEmailSet = new Set(
  (process.env.GOOGLE_CARRIER_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);
const shipperEmailSet = new Set(
  (process.env.GOOGLE_SHIPPER_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);

function resolveRoleByEmail(email: string): UserRole {
  const normalized = email.toLowerCase();
  if (adminEmailSet.has(normalized)) {
    return 'ADMIN';
  }
  if (carrierEmailSet.has(normalized)) {
    return 'CARRIER';
  }
  if (shipperEmailSet.has(normalized)) {
    return 'SHIPPER';
  }
  return 'SHIPPER';
}

function issueSession(user: AuthUser): string {
  const token = randomUUID();
  sessions.set(token, {
    user,
    expiresAt: Date.now() + authSessionTtlMs,
  });
  return token;
}

function extractAuthToken(req: express.Request): string | null {
  const header = req.header('authorization');
  if (header?.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return req.header('x-auth-token') ?? null;
}

function readSessionUser(req: express.Request): AuthUser | null {
  const token = extractAuthToken(req);
  if (!token) {
    return null;
  }
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session.user;
}

function requirePermission(permission: string): express.RequestHandler {
  return (req, res, next) => {
    const user = readSessionUser(req);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized. Please login first.' });
    }
    if (!user.permissions.includes(permission)) {
      return res.status(403).json({ message: `Forbidden. Missing permission: ${permission}` });
    }
    return next();
  };
}

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

const importWaybillRowSchema = waybillDraftSchema.extend({
  idempotencyKey: z.string().min(1).optional(),
});

const importChunkSchema = z.object({
  importBatchId: z.string().min(1).optional(),
  rows: z.array(importWaybillRowSchema).min(1).max(1000),
});

const pricingRuleSchema = z.object({
  id: z.number().int().positive().optional(),
  shipperId: z.string().min(1),
  truckType: z.enum(['4.2M', '6.8M', '9.6M', '17.5M']),
  minMileageKm: z.number().min(0),
  maxMileageKm: z.number().min(0),
  unitPricePerKm: z.number().min(0),
  loadingFee: z.number(),
  insuranceRate: z.number().min(0),
  index: z.number().int().min(0).optional(),
});

const settlementAdjustmentRuleSchema = z.object({
  id: z.number().int().positive().optional(),
  code: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(['LOADING', 'DEDUCTION']),
  mode: z.enum(['FIXED', 'LINE_HAUL_RATE']),
  value: z.number().min(0),
  enabled: z.boolean().default(true),
  shipperId: z.string().min(1).optional(),
  truckType: z.enum(['4.2M', '6.8M', '9.6M', '17.5M']).optional(),
  index: z.number().int().min(0).optional(),
});

function isMileageRangeOverlapped(
  left: Pick<PricingRule, 'minMileageKm' | 'maxMileageKm'>,
  right: Pick<PricingRule, 'minMileageKm' | 'maxMileageKm'>,
): boolean {
  return left.minMileageKm <= right.maxMileageKm && right.minMileageKm <= left.maxMileageKm;
}

function validatePricingRulePayload(
  rule: PricingRule,
  existingRules: PricingRule[],
  options?: { excludeId?: number; excludeIndex?: number },
): void {
  if (rule.maxMileageKm < rule.minMileageKm) {
    throw new Error('Invalid mileage range. maxMileageKm must be greater than or equal to minMileageKm.');
  }

  const conflict = existingRules.find((item, index) => {
    if (typeof options?.excludeId === 'number' && typeof item.id === 'number' && item.id === options.excludeId) {
      return false;
    }
    if (typeof options?.excludeIndex === 'number' && index === options.excludeIndex) {
      return false;
    }
    if (item.shipperId !== rule.shipperId || item.truckType !== rule.truckType) {
      return false;
    }
    return isMileageRangeOverlapped(rule, item);
  });

  if (conflict) {
    throw new Error(
      `Mileage range overlaps with existing rule (${conflict.shipperId}/${conflict.truckType}: ${conflict.minMileageKm}-${conflict.maxMileageKm}).`,
    );
  }
}

const partyProfileSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().min(1),
  phone: z.string().min(1),
});

const vehicleProfileSchema = z.object({
  plateNumber: z.string().min(1),
  truckType: z.enum(['4.2M', '6.8M', '9.6M', '17.5M']),
  maxWeightKg: z.number().min(0),
  maxVolumeM3: z.number().min(0),
  roadPermitExpiry: z.string().min(1),
  assignedDriverId: z.string().min(1),
});

const driverProfileSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  licenseNumber: z.string().min(1),
  licenseExpiry: z.string().min(1),
});

const googleLoginSchema = z.object({
  credential: z.string().min(1),
});

const devLoginSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(['ADMIN', 'SHIPPER', 'CARRIER']),
});

const passwordRegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8).max(72),
});

const passwordLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function toAuthUser(input: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  pictureUrl?: string | null;
}): AuthUser {
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    picture: input.pictureUrl ?? undefined,
    role: input.role,
    permissions: rolePermissions[input.role] ?? [],
  };
}

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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function ensureDbReady(): Promise<boolean> {
  if (isDbEnabled()) {
    return true;
  }

  const connected = await initializeDb();
  if (connected) {
    logger.info('db.reconnected', { storage: 'mysql-sharded' });
    try {
      await replacePricingRulesFromDb();
      await replaceSettlementAdjustmentRulesFromDb();
    } catch (error) {
      logger.warn('pricing_rules.reload_after_reconnect_failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    }
  }
  return connected;
}

async function buildDashboardSummaryFromDb() {
  const items = await listRecentWaybillsFromDb(100);
  const revenue = roundCurrency(items.reduce((sum, item) => sum + item.totalAmount, 0));
  const carrierCost = roundCurrency(revenue * 0.84);
  const carrierGrossProfit = roundCurrency(revenue - carrierCost);

  return {
    metrics: {
      waybillCount: items.length,
      revenue,
      carrierGrossProfit,
      onTimeSignRate:
        items.length === 0
          ? 1
          : roundCurrency(items.filter((item) => item.status === 'SIGNED' || item.status === 'POD_UPLOADED').length / items.length),
    },
    waybills: items.slice(0, 6),
    warnings: buildDocumentWarnings(),
  };
}

app.get('/api/auth/config', (_req, res) => {
  res.json({
    googleEnabled: Boolean(googleClientId),
    googleClientId: googleClientId || null,
    devLoginEnabled,
  });
});

app.get('/api/auth/me', (req, res) => {
  const user = readSessionUser(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }
  return res.json({ user });
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractAuthToken(req);
  if (token) {
    sessions.delete(token);
  }
  return res.json({ ok: true });
});

app.post('/api/auth/dev-login', (req, res) => {
  if (!devLoginEnabled) {
    return res.status(403).json({ message: 'Dev login is disabled.' });
  }

  const parsed = devLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid dev login payload.', issues: parsed.error.issues });
  }

  const user = toAuthUser({
    id: `dev:${parsed.data.email}`,
    email: parsed.data.email,
    name: parsed.data.name,
    role: parsed.data.role,
  });
  const token = issueSession(user);
  return res.json({ token, user });
});

app.post('/api/auth/register', async (req, res) => {
  if (!isDbEnabled()) {
    return res.status(400).json({ message: 'Password registration requires DB mode.' });
  }

  const parsed = passwordRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid register payload.', issues: parsed.error.issues });
  }

  try {
    await ensureAuthUserTable();
    const existed = await findAuthUserByEmail(parsed.data.email);
    if (existed) {
      return res.status(409).json({ message: 'Email already registered.' });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const account = await createPasswordUser({
      email: parsed.data.email,
      name: parsed.data.name,
      role: 'SHIPPER',
      passwordHash,
    });

    const user = toAuthUser({
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      pictureUrl: account.pictureUrl,
    });
    const token = issueSession(user);
    return res.status(201).json({ token, user });
  } catch (error) {
    logger.error('auth.register_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/auth/password-login', async (req, res) => {
  if (!isDbEnabled()) {
    return res.status(400).json({ message: 'Password login requires DB mode.' });
  }

  const parsed = passwordLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid password login payload.', issues: parsed.error.issues });
  }

  try {
    await ensureAuthUserTable();
    const account = await findAuthUserByEmail(parsed.data.email);
    if (!account || !account.passwordHash) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const passOk = await verifyPassword(parsed.data.password, account.passwordHash);
    if (!passOk) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    await touchAuthUserLogin(account.id);

    const user = toAuthUser({
      id: account.id,
      email: account.email,
      name: account.name,
      role: account.role,
      pictureUrl: account.pictureUrl,
    });
    const token = issueSession(user);
    return res.json({ token, user });
  } catch (error) {
    logger.error('auth.password_login_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const parsed = googleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid Google login payload.', issues: parsed.error.issues });
  }
  if (!googleClientId) {
    return res.status(400).json({ message: 'Google login is not configured on server.' });
  }

  try {
    const ticket = await authClient.verifyIdToken({
      idToken: parsed.data.credential,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.name || !payload.sub) {
      return res.status(400).json({ message: 'Google token payload missing required fields.' });
    }

    let user: AuthUser;
    if (isDbEnabled()) {
      await ensureAuthUserTable();
      const account = await upsertGoogleUser({
        googleSub: payload.sub,
        email: payload.email,
        name: payload.name,
        pictureUrl: payload.picture,
        defaultRole: resolveRoleByEmail(payload.email),
      });
      user = toAuthUser({
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        pictureUrl: account.pictureUrl,
      });
    } else {
      user = toAuthUser({
        id: `google:${payload.sub}`,
        email: payload.email,
        name: payload.name,
        role: resolveRoleByEmail(payload.email),
        pictureUrl: payload.picture,
      });
    }
    const token = issueSession(user);
    return res.json({ token, user });
  } catch (error) {
    logger.warn('auth.google_verify_failed', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return res.status(401).json({ message: 'Google token verification failed.' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'waybill-api', instanceId });
});

app.get('/api/ha/instance', (_req, res) => {
  res.json({ instanceId, status: 'running' });
});

app.get('/api/bootstrap', requirePermission('dashboard:view'), (req, res) => {
  const user = readSessionUser(req);
  if (!user) {
    return res.status(401).json({ message: 'Unauthorized. Please login first.' });
  }

  void rememberJson(`cache:bootstrap:v1:${user.role}`, 30 * 60, () => ({
    system: {
      name: 'Waybill & Settlement Admin',
      locales: ['zh-CN', 'en-US'],
      auth: ['Google OAuth2', 'RBAC'],
      infra: ['MySQL Sharding', 'Redis', 'RabbitMQ', 'Docker Compose', 'Nginx'],
    },
    permissions: getRolePermissions(),
    statusFlow: getStatusFlow(),
    references: getReferenceDataForPermissions(user.permissions),
  }))
    .then(({ value, hit }) => {
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/dashboard', requirePermission('dashboard:view'), (_req, res) => {
  void (async () => {
    try {
      if (await ensureDbReady()) {
        const { value, hit } = await rememberJson('cache:dashboard:v1', 20, async () => buildDashboardSummaryFromDb());
        res.setHeader('x-cache-hit', hit ? '1' : '0');
        return res.json(value);
      }

      const { value, hit } = await rememberJson('cache:dashboard:v1', 20, () => buildDashboardSummary());
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      return res.json(value);
    } catch (error: unknown) {
      return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    }
  })();
});

app.get('/api/waybills', requirePermission('waybill:view'), async (_req, res) => {
  if (!(await ensureDbReady())) {
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

app.get('/api/warnings', requirePermission('master:manage'), (_req, res) => {
  res.json({ items: buildDocumentWarnings() });
});

app.get('/api/pricing-rules', requirePermission('settlement:view'), async (_req, res) => {
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

app.post('/api/pricing-rules/reload', requirePermission('master:manage'), async (_req, res) => {
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

app.post('/api/pricing-rules', requirePermission('master:manage'), async (req, res) => {
  const parsed = pricingRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid pricing rule payload.', issues: parsed.error.issues });
  }

  const { index, ...rule } = parsed.data;

  try {
    if (isDbEnabled()) {
      const currentRules = await listPricingRulesFromDb();
      validatePricingRulePayload(rule, currentRules, { excludeId: rule.id });
      const rules = await upsertPricingRuleInDb(rule);
      await cacheDelete('cache:bootstrap:v1');
      logger.info('pricing_rules.upserted', {
        count: rules.length,
        index: typeof index === 'number' ? index : null,
        source: 'mysql',
      });
      return res.status(201).json({ source: 'mysql', count: rules.length, items: rules });
    }

    validatePricingRulePayload(rule, listPricingRules(), {
      excludeIndex: typeof index === 'number' ? index : undefined,
    });
    const rules = upsertPricingRule(rule, index);
    await cacheDelete('cache:bootstrap:v1');
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

app.delete('/api/pricing-rules/:id', requirePermission('master:manage'), async (req, res) => {
  const maybeId = Number(req.params.id);
  const maybeIndex = Number(req.query.index);

  try {
    if (isDbEnabled()) {
      let targetId = maybeId;
      if (!Number.isInteger(targetId) || targetId <= 0) {
        if (!Number.isInteger(maybeIndex) || maybeIndex < 0) {
          return res.status(400).json({ message: 'Invalid pricing rule id.' });
        }
        const currentRules = await listPricingRulesFromDb();
        targetId = Number(currentRules[maybeIndex]?.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ message: 'Invalid pricing rule id.' });
        }
      }
      const rules = await deletePricingRuleInDb(targetId);
      await cacheDelete('cache:bootstrap:v1');
      return res.json({ source: 'mysql', count: rules.length, items: rules });
    }

    if (!Number.isInteger(maybeIndex) || maybeIndex < 0) {
      return res.status(400).json({ message: 'Invalid pricing rule index.' });
    }
    const rules = deletePricingRule(maybeIndex);
    await cacheDelete('cache:bootstrap:v1');
    return res.json({ source: 'memory', count: rules.length, items: rules });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.get('/api/mq/status', requirePermission('report:view'), (_req, res) => {
  res.json(getMqRuntimeStatus());
});

app.get('/api/faults/diagnostics', requirePermission('report:view'), async (_req, res) => {
  if (!isDbEnabled()) {
    return res.status(400).json({
      message: 'Diagnostics requires DB mode.',
      storage: 'memory',
    });
  }

  try {
    const [feeMismatchRows, illegalOutboxRows] = await Promise.all([
      dbQuery(
        `SELECT w.waybill_no,
                w.total_amount AS waybill_total,
                ROUND(SUM(f.amount), 2) AS fee_total,
                ROUND(SUM(f.amount) - w.total_amount, 2) AS delta
         FROM (
           SELECT waybill_no, total_amount FROM waybill_202607_0
           UNION ALL
           SELECT waybill_no, total_amount FROM waybill_202607_1
           UNION ALL
           SELECT waybill_no, total_amount FROM waybill_202607_2
           UNION ALL
           SELECT waybill_no, total_amount FROM waybill_202607_3
         ) w
         JOIN waybill_fee_detail f ON f.waybill_no = w.waybill_no
         GROUP BY w.waybill_no, w.total_amount
         HAVING ROUND(SUM(f.amount) - w.total_amount, 2) <> 0
         ORDER BY ABS(ROUND(SUM(f.amount) - w.total_amount, 2)) DESC
         LIMIT 20`,
      ),
      dbQuery(
        `SELECT event_id,
                business_key,
                publish_status,
                JSON_UNQUOTE(JSON_EXTRACT(payload, '$.eventId')) AS payload_event_id,
                JSON_UNQUOTE(JSON_EXTRACT(payload, '$.waybillNo')) AS payload_waybill_no,
                JSON_UNQUOTE(JSON_EXTRACT(payload, '$.operation')) AS payload_operation
         FROM outbox_event
         WHERE publish_status IN ('NEW', 'FAILED')
           AND (
             JSON_EXTRACT(payload, '$.eventId') IS NULL
             OR JSON_EXTRACT(payload, '$.waybillNo') IS NULL
             OR JSON_EXTRACT(payload, '$.operation') IS NULL
           )
         ORDER BY created_at DESC
         LIMIT 20`,
      ),
    ]);

    return res.json({
      reasons: {
        feeMismatch: {
          count: feeMismatchRows.length,
          hint: 'waybill.total_amount does not match SUM(waybill_fee_detail.amount).',
          samples: feeMismatchRows,
        },
        illegalOutboxPayload: {
          count: illegalOutboxRows.length,
          hint: 'Outbox payload missing required fields: eventId / waybillNo / operation.',
          samples: illegalOutboxRows,
        },
      },
      nextActions: [
        'Fix dirty fee rows according to source-of-truth amount snapshot, then re-run diagnostics.',
        'Repair illegal outbox payload and set publish_status=NEW for replay.',
        'Run POST /api/mq/outbox/flush after MQ connection is restored.',
      ],
    });
  } catch (error) {
    return res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/mq/outbox/flush', requirePermission('report:view'), async (_req, res) => {
  const result = await flushOutbox();
  res.json(result);
});

app.get('/api/cache/status', requirePermission('report:view'), async (_req, res) => {
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

async function invalidateArchiveCaches(keys: string[]): Promise<void> {
  const toDelete = [...keys, 'cache:bootstrap:v1'];
  await Promise.all(toDelete.map((key) => cacheDelete(key)));
}

function buildArchiveId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

app.get('/api/archives/shippers/:id', requirePermission('master:manage'), (req, res) => {
  const cacheKey = `shipper:detail:${req.params.id}`;
  void rememberJsonNullable(cacheKey, 30 * 60, 60, () => {
    const item = shippers.find((row) => row.id === req.params.id);
    return item ?? null;
  })
    .then(({ value, hit }) => {
      if (!value) {
        return res.status(404).json({ message: 'Shipper not found.' });
      }
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/archives/carriers/:id', requirePermission('master:manage'), (req, res) => {
  const cacheKey = `carrier:detail:${req.params.id}`;
  void rememberJsonNullable(cacheKey, 30 * 60, 60, () => {
    const item = carriers.find((row) => row.id === req.params.id);
    return item ?? null;
  })
    .then(({ value, hit }) => {
      if (!value) {
        return res.status(404).json({ message: 'Carrier not found.' });
      }
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/archives/vehicles/:id', requirePermission('master:manage'), (req, res) => {
  const cacheKey = `vehicle:detail:${req.params.id}`;
  void rememberJsonNullable(cacheKey, 30 * 60, 60, () => {
    const item = vehicles.find((row) => row.id === req.params.id);
    return item ?? null;
  })
    .then(({ value, hit }) => {
      if (!value) {
        return res.status(404).json({ message: 'Vehicle not found.' });
      }
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/archives/drivers/:id', requirePermission('master:manage'), (req, res) => {
  const cacheKey = `driver:detail:${req.params.id}`;
  void rememberJsonNullable(cacheKey, 30 * 60, 60, () => {
    const item = drivers.find((row) => row.id === req.params.id);
    return item ?? null;
  })
    .then(({ value, hit }) => {
      if (!value) {
        return res.status(404).json({ message: 'Driver not found.' });
      }
      res.setHeader('x-cache-hit', hit ? '1' : '0');
      res.json(value);
    })
    .catch((error: unknown) => {
      res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
    });
});

app.get('/api/cache/scenarios', requirePermission('report:view'), async (_req, res) => {
  const [
    shipperDetailCount,
    carrierDetailCount,
    vehicleDetailCount,
    driverDetailCount,
    lockCount,
    idempotencyCount,
    dashboardCount,
    waybillRecentCount,
    bootstrapCount,
    archiveSample,
  ] = await Promise.all([
    cacheCountByPattern('shipper:detail:*'),
    cacheCountByPattern('carrier:detail:*'),
    cacheCountByPattern('vehicle:detail:*'),
    cacheCountByPattern('driver:detail:*'),
    cacheCountByPattern('lock:create-waybill:*'),
    cacheCountByPattern('idem:*'),
    cacheCountByPattern('cache:dashboard:v1'),
    cacheCountByPattern('cache:waybills:recent:50'),
    cacheCountByPattern('cache:bootstrap:v1'),
    cacheScanKeys('*:detail:*', 12),
  ]);

  return res.json({
    scenarios: {
      archiveDetailCache: {
        shipperDetailCount,
        carrierDetailCount,
        vehicleDetailCount,
        driverDetailCount,
      },
      distributedLockCache: {
        keyPattern: 'lock:create-waybill:*',
        keyCount: lockCount,
      },
      idempotencyCache: {
        keyPattern: 'idem:*',
        keyCount: idempotencyCount,
      },
      dashboardHotCache: {
        dashboardCount,
        waybillRecentCount,
        bootstrapCount,
      },
    },
    samples: {
      archiveDetailKeys: archiveSample,
    },
    policy: {
      ttlSeconds: {
        archiveDetail: 1800,
        archiveNullValue: 60,
        bootstrap: 1800,
        dashboard: 20,
        waybillRecent: 15,
        idempotencySnapshot: 86400,
      },
      antiPenetration: 'Cache null with short ttl (60s) for missing archive records.',
      antiBreakdown: 'Hot keys use short TTL and active invalidation on write paths.',
    },
  });
});

app.post('/api/archives/shippers', requirePermission('master:manage'), async (req, res) => {
  const parsed = partyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid shipper payload.', issues: parsed.error.issues });
  }

  const newItem = {
    id: buildArchiveId('shipper'),
    ...parsed.data,
  };
  shippers.push(newItem);
  await invalidateArchiveCaches([`shipper:detail:${newItem.id}`]);
  return res.status(201).json(newItem);
});

app.put('/api/archives/shippers/:id', requirePermission('master:manage'), async (req, res) => {
  const parsed = partyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid shipper payload.', issues: parsed.error.issues });
  }

  const index = shippers.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Shipper not found.' });
  }

  shippers[index] = {
    ...shippers[index],
    ...parsed.data,
  };
  await invalidateArchiveCaches([`shipper:detail:${req.params.id}`]);
  return res.json(shippers[index]);
});

app.post('/api/archives/carriers', requirePermission('master:manage'), async (req, res) => {
  const parsed = partyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid carrier payload.', issues: parsed.error.issues });
  }

  const newItem = {
    id: buildArchiveId('carrier'),
    ...parsed.data,
  };
  carriers.push(newItem);
  await invalidateArchiveCaches([`carrier:detail:${newItem.id}`]);
  return res.status(201).json(newItem);
});

app.put('/api/archives/carriers/:id', requirePermission('master:manage'), async (req, res) => {
  const parsed = partyProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid carrier payload.', issues: parsed.error.issues });
  }

  const index = carriers.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Carrier not found.' });
  }

  carriers[index] = {
    ...carriers[index],
    ...parsed.data,
  };
  await invalidateArchiveCaches([`carrier:detail:${req.params.id}`]);
  return res.json(carriers[index]);
});

app.post('/api/archives/vehicles', requirePermission('master:manage'), async (req, res) => {
  const parsed = vehicleProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid vehicle payload.', issues: parsed.error.issues });
  }

  const newItem = {
    id: buildArchiveId('vehicle'),
    ...parsed.data,
  };
  vehicles.push(newItem);
  await invalidateArchiveCaches([`vehicle:detail:${newItem.id}`]);
  return res.status(201).json(newItem);
});

app.put('/api/archives/vehicles/:id', requirePermission('master:manage'), async (req, res) => {
  const parsed = vehicleProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid vehicle payload.', issues: parsed.error.issues });
  }

  const index = vehicles.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Vehicle not found.' });
  }

  vehicles[index] = {
    ...vehicles[index],
    ...parsed.data,
  };
  await invalidateArchiveCaches([`vehicle:detail:${req.params.id}`]);
  return res.json(vehicles[index]);
});

app.post('/api/archives/drivers', requirePermission('master:manage'), async (req, res) => {
  const parsed = driverProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid driver payload.', issues: parsed.error.issues });
  }

  const newItem = {
    id: buildArchiveId('driver'),
    ...parsed.data,
  };
  drivers.push(newItem);
  await invalidateArchiveCaches([`driver:detail:${newItem.id}`]);
  return res.status(201).json(newItem);
});

app.put('/api/archives/drivers/:id', requirePermission('master:manage'), async (req, res) => {
  const parsed = driverProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid driver payload.', issues: parsed.error.issues });
  }

  const index = drivers.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Driver not found.' });
  }

  drivers[index] = {
    ...drivers[index],
    ...parsed.data,
  };
  await invalidateArchiveCaches([`driver:detail:${req.params.id}`]);
  return res.json(drivers[index]);
});

app.delete('/api/archives/shippers/:id', requirePermission('master:manage'), async (req, res) => {
  const index = shippers.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Shipper not found.' });
  }

  const usedByWaybill = waybills.some((item) => item.shipperId === req.params.id);
  const usedByPricing = listPricingRules().some((item) => item.shipperId === req.params.id);
  if (usedByWaybill || usedByPricing) {
    return res.status(409).json({ message: 'Shipper is in use and cannot be deleted.' });
  }

  const [removed] = shippers.splice(index, 1);
  await invalidateArchiveCaches([`shipper:detail:${req.params.id}`]);
  return res.json(removed);
});

app.delete('/api/archives/carriers/:id', requirePermission('master:manage'), async (req, res) => {
  const index = carriers.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Carrier not found.' });
  }

  const usedByWaybill = waybills.some((item) => item.carrierId === req.params.id);
  if (usedByWaybill) {
    return res.status(409).json({ message: 'Carrier is in use and cannot be deleted.' });
  }

  const [removed] = carriers.splice(index, 1);
  await invalidateArchiveCaches([`carrier:detail:${req.params.id}`]);
  return res.json(removed);
});

app.delete('/api/archives/vehicles/:id', requirePermission('master:manage'), async (req, res) => {
  const index = vehicles.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Vehicle not found.' });
  }

  const usedByWaybill = waybills.some((item) => item.vehicleId === req.params.id);
  if (usedByWaybill) {
    return res.status(409).json({ message: 'Vehicle is in use and cannot be deleted.' });
  }

  const [removed] = vehicles.splice(index, 1);
  await invalidateArchiveCaches([`vehicle:detail:${req.params.id}`]);
  return res.json(removed);
});

app.delete('/api/archives/drivers/:id', requirePermission('master:manage'), async (req, res) => {
  const index = drivers.findIndex((item) => item.id === req.params.id);
  if (index < 0) {
    return res.status(404).json({ message: 'Driver not found.' });
  }

  const assignedVehicle = vehicles.some((item) => item.assignedDriverId === req.params.id);
  if (assignedVehicle) {
    return res.status(409).json({ message: 'Driver is assigned to a vehicle and cannot be deleted.' });
  }

  const [removed] = drivers.splice(index, 1);
  await invalidateArchiveCaches([`driver:detail:${req.params.id}`]);
  return res.json(removed);
});

app.post('/api/waybills/quote', requirePermission('waybill:create'), (req, res) => {
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
    if (!capacity.valid) {
      return res.status(400).json({
        code: 'CAPACITY_EXCEEDED',
        message: `Capacity exceeded. overweightKg=${capacity.overweightKg}, overVolumeM3=${capacity.overVolumeM3}, suggestedSplitCount=${capacity.suggestedSplitCount}`,
        ...capacity,
      });
    }
    const fee = calculateFees(parsed.data);
    return res.json({ capacity, fee });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/waybills', requirePermission('waybill:create'), async (req, res) => {
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) {
    return;
  }

  const idemSnapshot = await getIdempotencySnapshot<unknown>(idempotencyKey);
  if (idemSnapshot) {
    // Request-key idempotency is the first guard: identical retries return the stored
    // snapshot immediately, without re-entering DB writes, MQ publish, or status changes.
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
      // Lock serializes current contenders; occupation check confirms whether the vehicle
      // is already held by an active waybill from an earlier successful request.
      const occupied = isDbEnabled()
        ? await hasActiveWaybillForVehicleInDb(parsed.data.vehicleId)
        : hasActiveWaybillForVehicleInMemory(parsed.data.vehicleId);
      if (occupied) {
        return res.status(409).json({
          message: 'Vehicle is already occupied by an active waybill.',
          vehicleId: parsed.data.vehicleId,
        });
      }

      const vehicle = vehicles.find((item) => item.id === parsed.data.vehicleId);
      if (!vehicle) {
        return res.status(404).json({ message: 'Vehicle not found.' });
      }

      const splitPlan = buildSplitPlan(parsed.data);
      // Child drafts are revalidated before persistence so a bad split plan cannot leak
      // an over-capacity child order into the database.
      const invalidChild = splitPlan.childDrafts.find((child) => !validateCapacity(child, vehicle).valid);
      if (invalidChild) {
        const invalidCapacity = validateCapacity(invalidChild, vehicle);
        return res.status(400).json({
          code: 'SPLIT_PLAN_INVALID',
          message:
            `Split plan validation failed. overweightKg=${invalidCapacity.overweightKg}, ` +
            `overVolumeM3=${invalidCapacity.overVolumeM3}, suggestedSplitCount=${splitPlan.suggestedSplitCount}`,
          overweightKg: invalidCapacity.overweightKg,
          overVolumeM3: invalidCapacity.overVolumeM3,
          suggestedSplitCount: splitPlan.suggestedSplitCount,
        });
      }

      const createOne = async (draft: typeof parsed.data, key: string) => {
        const existedBeforeCreate = isDbEnabled()
          ? await findCreateWaybillByIdempotencyKeyInDb(key)
          : idempotencyStore.has(key);

        const waybill = isDbEnabled()
          ? await createWaybillInDb(draft, key)
          : createWaybill(draft, key);

        if (!existedBeforeCreate) {
          // CREATE events are only emitted for the first successful create path.
          // Replayed idempotent requests must not fan out duplicate MQ events.
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

app.post('/api/waybills/:id/sign', requirePermission('waybill:transition'), async (req, res) => {
  const waybillId = String(req.params.id);
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) {
    return;
  }

  // Fast-path idempotency interception: return prior snapshot directly when key already exists.
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
      ? await findWaybillInDb(waybillId)
      : waybills.find((item) => item.id === waybillId);
    const wasSignedOrDone = before ? before.status === 'SIGNED' || before.status === 'POD_UPLOADED' : false;

    const transitionResult = isDbEnabled()
      ? await transitionWaybillInDb(waybillId, 'SIGN', idempotencyKey)
      : {
          waybill: transitionWaybill(waybillId, 'SIGN', idempotencyKey),
          idempotentBlocked: wasSignedOrDone,
          reason: wasSignedOrDone ? 'ALREADY_SIGNED' : undefined,
        };

    const waybill = transitionResult.waybill;
    const shouldPublish = !wasSignedOrDone && !transitionResult.idempotentBlocked;
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
    if (shouldPublish) {
      logger.info('waybill.signed', {
        idempotencyKey,
        waybillNo: waybill.waybillNo,
      });
    }

    if (wasSignedOrDone || transitionResult.idempotentBlocked) {
      const reason = transitionResult.reason ?? 'ALREADY_SIGNED';
      const messageByReason: Record<string, string> = {
        ALREADY_SIGNED: 'Duplicate SIGN operation was ignored because waybill is already signed.',
        IDEMPOTENCY_KEY_HIT: 'Duplicate SIGN request was blocked by idempotency key.',
        UNIQUE_CONSTRAINT_HIT: 'Duplicate SIGN operation was blocked by unique constraint fallback.',
      };
      return res.status(200).json({
        idempotentBlocked: true,
        reason,
        message: messageByReason[reason] ?? messageByReason.ALREADY_SIGNED,
        data: waybill,
      });
    }

    return res.json(waybill);
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/waybills/:id/upload-pod', requirePermission('pod:upload'), async (req, res) => {
  const waybillId = String(req.params.id);
  const idempotencyKey = requireIdempotencyKey(req, res);
  if (!idempotencyKey) {
    return;
  }

  // Fast-path idempotency interception: return prior snapshot directly when key already exists.
  const idemSnapshot = await getIdempotencySnapshot<unknown>(idempotencyKey);
  if (idemSnapshot) {
    // Reusing the same upload request key returns the prior result snapshot and avoids
    // touching state timestamps or publishing the same UPLOAD_POD event again.
    return res.status(200).json({
      idempotentBlocked: true,
      reason: 'IDEMPOTENCY_KEY_HIT',
      message: 'Duplicate UPLOAD_POD request was blocked by idempotency key.',
      data: idemSnapshot,
    });
  }

  try {
    const before = isDbEnabled()
      ? await findWaybillInDb(waybillId)
      : waybills.find((item) => item.id === waybillId);
    const wasPodUploaded = before ? before.podUploaded : false;

    const transitionResult = isDbEnabled()
      ? await transitionWaybillInDb(waybillId, 'UPLOAD_POD', idempotencyKey)
      : {
          waybill: transitionWaybill(waybillId, 'UPLOAD_POD', idempotencyKey),
          idempotentBlocked: wasPodUploaded,
          reason: wasPodUploaded ? 'ALREADY_POD_UPLOADED' : undefined,
        };

    const waybill = transitionResult.waybill;
    const shouldPublish = !wasPodUploaded && !transitionResult.idempotentBlocked;
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
    if (shouldPublish) {
      logger.info('waybill.pod_uploaded', {
        idempotencyKey,
        waybillNo: waybill.waybillNo,
      });
    }

    if (wasPodUploaded || transitionResult.idempotentBlocked) {
      const reason = transitionResult.reason ?? 'ALREADY_POD_UPLOADED';
      const messageByReason: Record<string, string> = {
        ALREADY_POD_UPLOADED: 'Duplicate UPLOAD_POD operation was ignored because POD is already uploaded.',
        IDEMPOTENCY_KEY_HIT: 'Duplicate UPLOAD_POD request was blocked by idempotency key.',
        UNIQUE_CONSTRAINT_HIT: 'Duplicate UPLOAD_POD operation was blocked by unique constraint fallback.',
      };
      return res.status(200).json({
        idempotentBlocked: true,
        reason,
        message: messageByReason[reason] ?? messageByReason.ALREADY_POD_UPLOADED,
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
      void replaceSettlementAdjustmentRulesFromDb()
        .then((rules) => {
          logger.info('settlement_adjustments.reloaded_on_boot', { count: rules.length });
        })
        .catch((error: unknown) => {
          logger.warn('settlement_adjustments.reload_on_boot_failed', {
            error: error instanceof Error ? error.message : 'unknown',
          });
        });
      return;
    }
    logger.warn('db.unavailable_fallback_memory', {});
  });
  void startWaybillConsumer();
});

app.get('/api/settlement-adjustments', requirePermission('settlement:view'), (_req, res) => {
  void (async () => {
    if (isDbEnabled()) {
      const items = await listSettlementAdjustmentRulesFromDb();
      return res.json({ source: 'mysql', items });
    }
    return res.json({ source: 'memory', items: listSettlementAdjustmentRules() });
  })().catch((error: unknown) => {
    res.status(500).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  });
});

app.post('/api/settlement-adjustments', requirePermission('master:manage'), async (req, res) => {
  const parsed = settlementAdjustmentRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid settlement adjustment payload.', issues: parsed.error.issues });
  }

  const { index, ...rule } = parsed.data;
  try {
    if (isDbEnabled()) {
      const items = await upsertSettlementAdjustmentRuleInDb(rule);
      await cacheDelete('cache:bootstrap:v1');
      return res.status(201).json({ source: 'mysql', count: items.length, items });
    }
    const items = upsertSettlementAdjustmentRule(rule, index);
    await cacheDelete('cache:bootstrap:v1');
    return res.status(201).json({ source: 'memory', count: items.length, items });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.delete('/api/settlement-adjustments/:id', requirePermission('master:manage'), async (req, res) => {
  const maybeId = Number(req.params.id);
  const maybeIndex = Number(req.query.index);

  try {
    if (isDbEnabled()) {
      let targetId = maybeId;
      if (!Number.isInteger(targetId) || targetId <= 0) {
        if (!Number.isInteger(maybeIndex) || maybeIndex < 0) {
          return res.status(400).json({ message: 'Invalid settlement adjustment id.' });
        }
        const currentRules = await listSettlementAdjustmentRulesFromDb();
        targetId = Number(currentRules[maybeIndex]?.id);
        if (!Number.isInteger(targetId) || targetId <= 0) {
          return res.status(400).json({ message: 'Invalid settlement adjustment id.' });
        }
      }
      const items = await deleteSettlementAdjustmentRuleInDb(targetId);
      await cacheDelete('cache:bootstrap:v1');
      return res.json({ source: 'mysql', count: items.length, items });
    }

    if (!Number.isInteger(maybeIndex) || maybeIndex < 0) {
      return res.status(400).json({ message: 'Invalid settlement adjustment index.' });
    }
    const items = deleteSettlementAdjustmentRule(maybeIndex);
    await cacheDelete('cache:bootstrap:v1');
    return res.json({ source: 'memory', count: items.length, items });
  } catch (error: unknown) {
    res.status(400).json({ message: error instanceof Error ? error.message : 'Unknown error' });
  }
});

app.post('/api/waybills/import/chunk', requirePermission('waybill:create'), async (req, res) => {
  const parsed = importChunkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Invalid import chunk payload.', issues: parsed.error.issues });
  }

  const start = Date.now();
  const heapBeforeMB = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;

  const importBatchId = parsed.data.importBatchId ?? `import-${Date.now().toString(36)}`;
  let created = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = 0; i < parsed.data.rows.length; i += 1) {
    const item = parsed.data.rows[i];
    if (!isDbEnabled()) {
      const idempotencyKey = item.idempotencyKey ?? `${importBatchId}:${i + 1}`;
      try {
        createWaybill(item, idempotencyKey);
        created += 1;
      } catch (error) {
        failed += 1;
        if (errors.length < 5) {
          errors.push(error instanceof Error ? error.message : 'Unknown error');
        }
      }
    }
  }

  if (isDbEnabled()) {
    try {
      const result = await importWaybillChunkInDb(parsed.data.rows, importBatchId);
      created = result.created;
      failed = result.failed;
      errors.push(...result.errors);
    } catch (error) {
      failed = parsed.data.rows.length;
      if (errors.length < 5) {
        errors.push(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }

  if (created > 0) {
    await invalidateHotCaches();
  }

  const heapAfterMB = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const durationMs = Date.now() - start;

  return res.json({
    importBatchId,
    chunkSize: parsed.data.rows.length,
    created,
    failed,
    errors,
    durationMs,
    heapBeforeMB,
    heapAfterMB,
    heapDeltaMB: Math.round((heapAfterMB - heapBeforeMB) * 100) / 100,
    storage: isDbEnabled() ? 'mysql-sharded' : 'memory',
  });
});