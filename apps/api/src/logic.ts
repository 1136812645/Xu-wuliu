import {
  carriers,
  drivers,
  idempotencyStore,
  pricingRules,
  shippers,
  vehicles,
  waybills,
} from './data.js';
import type {
  CapacityValidationResult,
  DocumentWarning,
  FeeCalculationResult,
  FeeComponent,
  PricingRule,
  VehicleProfile,
  WaybillDraft,
  WaybillRecord,
  WaybillSplitPlan,
  WaybillStatus,
} from './domain.js';

const WAYBILL_ACTIONS = new Set(['SIGN', 'UPLOAD_POD']);

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) {
    return [];
  }
  const avg = roundCurrency(total / parts);
  const values = Array.from({ length: parts }, () => avg);
  const consumed = roundCurrency(values.slice(0, parts - 1).reduce((sum, item) => sum + item, 0));
  values[parts - 1] = roundCurrency(total - consumed);
  return values;
}

export function buildSplitPlan(draft: WaybillDraft): WaybillSplitPlan {
  // Split planning is deterministic, so retries with the same draft are stable.
  const vehicle = vehicles.find((item) => item.id === draft.vehicleId);
  if (!vehicle) {
    throw new Error('Vehicle not found.');
  }

  const validation = validateCapacity(draft, vehicle);
  if (validation.valid) {
    return {
      splitRequired: false,
      suggestedSplitCount: 1,
      overweightKg: 0,
      overVolumeM3: 0,
      childDrafts: [draft],
    };
  }

  const parts = validation.suggestedSplitCount;
  const weightParts = splitAmount(draft.weightKg, parts);
  const volumeParts = splitAmount(draft.volumeM3, parts);
  const loadingParts = splitAmount(draft.extraLoadingFee, parts);
  const subsidyParts = splitAmount(draft.subsidy, parts);
  const deductionParts = splitAmount(draft.deduction, parts);

  const childDrafts: WaybillDraft[] = [];
  for (let i = 0; i < parts; i += 1) {
    childDrafts.push({
      ...draft,
      goodsName: `${draft.goodsName} [S${i + 1}/${parts}]`,
      weightKg: weightParts[i],
      volumeM3: volumeParts[i],
      extraLoadingFee: loadingParts[i],
      subsidy: subsidyParts[i],
      deduction: deductionParts[i],
    });
  }

  return {
    splitRequired: true,
    suggestedSplitCount: parts,
    overweightKg: validation.overweightKg,
    overVolumeM3: validation.overVolumeM3,
    childDrafts,
  };
}

function findRule(draft: WaybillDraft, vehicle: VehicleProfile): PricingRule {
  const rule = pricingRules.find(
    (item) =>
      item.shipperId === draft.shipperId &&
      item.truckType === vehicle.truckType &&
      draft.mileageKm >= item.minMileageKm &&
      draft.mileageKm <= item.maxMileageKm,
  );

  if (!rule) {
    throw new Error('No pricing rule matched current shipper, mileage, and truck type.');
  }

  return rule;
}

function normalizeRule(rule: PricingRule): PricingRule {
  return {
    shipperId: rule.shipperId,
    truckType: rule.truckType,
    minMileageKm: Number(rule.minMileageKm),
    maxMileageKm: Number(rule.maxMileageKm),
    unitPricePerKm: Number(rule.unitPricePerKm),
    loadingFee: Number(rule.loadingFee),
    insuranceRate: Number(rule.insuranceRate),
  };
}

export function listPricingRules(): PricingRule[] {
  return pricingRules.map((rule) => ({ ...rule }));
}

export function replacePricingRules(nextRules: PricingRule[]): void {
  pricingRules.length = 0;
  for (const rule of nextRules) {
    pricingRules.push(normalizeRule(rule));
  }
}

export function upsertPricingRule(rule: PricingRule, index?: number): PricingRule[] {
  const normalized = normalizeRule(rule);
  if (typeof index === 'number' && index >= 0 && index < pricingRules.length) {
    pricingRules[index] = normalized;
    return listPricingRules();
  }
  pricingRules.push(normalized);
  return listPricingRules();
}

export function resolveShardTable(waybillNo: string, createdAt: Date, shardCount = 4): string {
  if (shardCount <= 0) {
    throw new Error('Shard count must be greater than zero.');
  }
  const month = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
  const tail = waybillNo.charCodeAt(waybillNo.length - 1) % shardCount;
  return `waybill_${month}_${tail}`;
}

export function validateCapacity(draft: WaybillDraft, vehicle: VehicleProfile): CapacityValidationResult {
  const overweightKg = Math.max(0, draft.weightKg - vehicle.maxWeightKg);
  const overVolumeM3 = Math.max(0, draft.volumeM3 - vehicle.maxVolumeM3);
  const weightRatio = vehicle.maxWeightKg > 0 ? draft.weightKg / vehicle.maxWeightKg : 0;
  const volumeRatio = vehicle.maxVolumeM3 > 0 ? draft.volumeM3 / vehicle.maxVolumeM3 : 0;
  const suggestedSplitCount = Math.max(1, Math.ceil(Math.max(weightRatio, volumeRatio)));

  return {
    valid: overweightKg === 0 && overVolumeM3 === 0,
    overweightKg,
    overVolumeM3,
    suggestedSplitCount,
  };
}

export function calculateFees(draft: WaybillDraft): FeeCalculationResult {
  // Keep pricing validation in one place so quote/create/share identical behavior.
  if (!draft.goodsName.trim()) {
    throw new Error('Empty waybill is not allowed.');
  }

  if (draft.mileageKm < 0 || draft.weightKg < 0 || draft.volumeM3 < 0) {
    throw new Error('Mileage, weight, and volume must be greater than or equal to zero.');
  }

  const vehicle = vehicles.find((item) => item.id === draft.vehicleId);
  if (!vehicle) {
    throw new Error('Vehicle not found.');
  }

  const capacity = validateCapacity(draft, vehicle);
  if (!capacity.valid) {
    throw new Error(
      `Capacity exceeded. overweightKg=${capacity.overweightKg}, overVolumeM3=${capacity.overVolumeM3}, suggestedSplitCount=${capacity.suggestedSplitCount}`,
    );
  }

  const rule = findRule(draft, vehicle);
  const lineHaul = roundCurrency(draft.mileageKm * rule.unitPricePerKm);
  const loading = roundCurrency(rule.loadingFee + draft.extraLoadingFee);
  const insurance = roundCurrency(lineHaul * rule.insuranceRate);
  const subsidy = roundCurrency(draft.subsidy);
  const deduction = roundCurrency(draft.deduction * -1);

  const fees: FeeComponent[] = [
    {
      type: 'LINE_HAUL',
      label: '干线运费 / Line haul',
      amount: lineHaul,
      formula: `${draft.mileageKm}km x ${rule.unitPricePerKm}`,
    },
    {
      type: 'LOADING',
      label: '装卸费 / Loading',
      amount: loading,
      formula: `${rule.loadingFee} + ${draft.extraLoadingFee}`,
    },
    {
      type: 'INSURANCE',
      label: '保险费 / Insurance',
      amount: insurance,
      formula: `${lineHaul} x ${rule.insuranceRate}`,
    },
    {
      type: 'SUBSIDY',
      label: '补贴 / Subsidy',
      amount: subsidy,
      formula: `${draft.subsidy}`,
    },
    {
      type: 'DEDUCTION',
      label: '扣款 / Deduction',
      amount: deduction,
      formula: `${draft.deduction} x -1`,
    },
  ];

  const totalAmount = roundCurrency(fees.reduce((sum, item) => sum + item.amount, 0));
  const waybillNo = `WB${Date.now().toString().slice(-8)}`;

  return {
    fees,
    totalAmount,
    shardTable: resolveShardTable(waybillNo, new Date()),
  };
}

export function createWaybill(draft: WaybillDraft, idempotencyKey?: string): WaybillRecord {
  // The memory path preserves idempotent semantics as fallback when DB is unavailable.
  if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
    const existingId = idempotencyStore.get(idempotencyKey)!;
    const existing = waybills.find((item) => item.id === existingId);
    if (existing) {
      return existing;
    }
  }

  const feeResult = calculateFees(draft);
  const now = new Date();
  const waybillNo = `WB${now.getTime().toString().slice(-8)}`;
  const record: WaybillRecord = {
    ...draft,
    id: `waybill-${waybills.length + 1}`,
    waybillNo,
    status: 'ASSIGNED',
    fees: feeResult.fees,
    totalAmount: feeResult.totalAmount,
    createdAt: now.toISOString(),
    podUploaded: false,
    shardTable: resolveShardTable(waybillNo, now),
  };

  waybills.unshift(record);
  if (idempotencyKey) {
    idempotencyStore.set(idempotencyKey, record.id);
  }
  return record;
}

export function transitionWaybill(
  waybillId: string,
  action: 'SIGN' | 'UPLOAD_POD',
  idempotencyKey?: string,
): WaybillRecord {
  // Status transition is guarded by both action-level and final-status idempotency.
  if (!WAYBILL_ACTIONS.has(action)) {
    throw new Error('Unsupported action.');
  }

  const waybill = waybills.find((item) => item.id === waybillId);
  if (!waybill) {
    throw new Error('Waybill not found.');
  }

  const actionKey = idempotencyKey ?? `${waybillId}:${action}`;
  if (idempotencyStore.has(actionKey)) {
    return waybill;
  }

  if (action === 'SIGN') {
    if (waybill.status === 'SIGNED' || waybill.status === 'POD_UPLOADED') {
      return waybill;
    }
    waybill.status = 'SIGNED';
    waybill.signedAt = new Date().toISOString();
  }

  if (action === 'UPLOAD_POD') {
    if (waybill.podUploaded) {
      return waybill;
    }
    if (waybill.status !== 'SIGNED' && waybill.status !== 'POD_UPLOADED') {
      throw new Error('Waybill must be signed before POD upload.');
    }
    waybill.podUploaded = true;
    waybill.status = 'POD_UPLOADED';
    waybill.podUploadedAt = new Date().toISOString();
  }

  idempotencyStore.set(actionKey, waybill.id);
  return waybill;
}

function toWarningStatus(daysRemaining: number | null): 'EXPIRED' | 'EXPIRING_SOON' | 'INVALID' | null {
  if (daysRemaining === null) {
    return 'INVALID';
  }
  if (daysRemaining < 0) {
    return 'EXPIRED';
  }
  if (daysRemaining <= 30) {
    return 'EXPIRING_SOON';
  }
  return null;
}

function calculateDaysRemaining(dateText: string): number | null {
  const target = new Date(dateText);
  if (Number.isNaN(target.getTime())) {
    return null;
  }
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.floor((end - start) / (1000 * 60 * 60 * 24));
}

export function buildDocumentWarnings(): DocumentWarning[] {
  const result: DocumentWarning[] = [];

  for (const driver of drivers) {
    const daysRemaining = calculateDaysRemaining(driver.licenseExpiry);
    const status = toWarningStatus(daysRemaining);
    if (status) {
      result.push({
        entityType: 'DRIVER',
        entityId: driver.id,
        entityName: driver.name,
        documentName: 'Driver License',
        expiryDate: driver.licenseExpiry,
        status,
        daysRemaining,
      });
    }
  }

  for (const vehicle of vehicles) {
    const daysRemaining = calculateDaysRemaining(vehicle.roadPermitExpiry);
    const status = toWarningStatus(daysRemaining);
    if (status) {
      result.push({
        entityType: 'VEHICLE',
        entityId: vehicle.id,
        entityName: vehicle.plateNumber,
        documentName: 'Road Permit',
        expiryDate: vehicle.roadPermitExpiry,
        status,
        daysRemaining,
      });
    }
  }

  return result;
}

export function buildDashboardSummary() {
  const revenue = roundCurrency(waybills.reduce((sum, item) => sum + item.totalAmount, 0));
  const carrierCost = roundCurrency(revenue * 0.84);
  const carrierGrossProfit = roundCurrency(revenue - carrierCost);

  return {
    metrics: {
      waybillCount: waybills.length,
      revenue,
      carrierGrossProfit,
      onTimeSignRate: waybills.length === 0 ? 1 : roundCurrency(waybills.filter((item) => item.status === 'SIGNED' || item.status === 'POD_UPLOADED').length / waybills.length),
    },
    waybills: waybills.slice(0, 6),
    warnings: buildDocumentWarnings(),
  };
}

export function getReferenceData() {
  return {
    shippers,
    carriers,
    drivers,
    vehicles,
    pricingRules,
  };
}

export function getRolePermissions(): Record<string, string[]> {
  return {
    SHIPPER: ['dashboard:view', 'waybill:create', 'waybill:view', 'settlement:view'],
    CARRIER: ['dashboard:view', 'waybill:view', 'pod:upload'],
    ADMIN: ['dashboard:view', 'waybill:create', 'waybill:transition', 'master:manage', 'settlement:view', 'report:view'],
  };
}

export function getStatusFlow(): Array<{ status: WaybillStatus; next: WaybillStatus[] }> {
  return [
    { status: 'DRAFT', next: ['ASSIGNED'] },
    { status: 'ASSIGNED', next: ['PICKED_UP'] },
    { status: 'PICKED_UP', next: ['IN_TRANSIT'] },
    { status: 'IN_TRANSIT', next: ['SIGNED'] },
    { status: 'SIGNED', next: ['POD_UPLOADED'] },
    { status: 'POD_UPLOADED', next: [] },
  ];
}

export function seedDemoWaybills() {
  if (waybills.length > 0) {
    return;
  }

  createWaybill(
    {
      shipperId: 'shipper-1',
      carrierId: 'carrier-1',
      vehicleId: 'vehicle-1',
      mileageKm: 420,
      weightKg: 9200,
      volumeM3: 28,
      goodsName: '空调与冰箱',
      extraLoadingFee: 80,
      subsidy: 120,
      deduction: 50,
    },
    'seed-1',
  );

  createWaybill(
    {
      shipperId: 'shipper-2',
      carrierId: 'carrier-2',
      vehicleId: 'vehicle-2',
      mileageKm: 0,
      weightKg: 1000,
      volumeM3: 2,
      goodsName: 'Return pallets',
      extraLoadingFee: 0,
      subsidy: -20,
      deduction: 0,
    },
    'seed-2',
  );

  transitionWaybill('waybill-1', 'SIGN', 'seed-sign');
}
