import {
  carriers,
  drivers,
  idempotencyStore,
  pricingRules,
  settlementAdjustmentRules,
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
  SettlementAdjustmentRule,
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

function toCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromCents(cents: number): number {
  return roundCurrency(cents / 100);
}

function sumCurrency(values: number[]): number {
  const totalCents = values.reduce((sum, value) => sum + toCents(value), 0);
  return fromCents(totalCents);
}

function splitAmount(total: number, parts: number): number[] {
  if (parts <= 0) {
    return [];
  }
  const totalCents = toCents(total);
  const baseCents = Math.trunc(totalCents / parts);
  const remainder = totalCents - baseCents * parts;
  // Make split deterministic and cent-accurate to avoid drift during high-volume splits.
  const values = Array.from({ length: parts }, (_v, index) => fromCents(index < remainder ? baseCents + 1 : baseCents));
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

  const impossibleWeightSplit = vehicle.maxWeightKg <= 0 && draft.weightKg > 0;
  const impossibleVolumeSplit = vehicle.maxVolumeM3 <= 0 && draft.volumeM3 > 0;
  if (impossibleWeightSplit || impossibleVolumeSplit) {
    throw new Error('Vehicle capacity configuration is invalid for split planning.');
  }

  let parts = validation.suggestedSplitCount;

  // Keep increasing split parts until each child satisfies both weight and volume constraints.
  while (parts <= 1000) {
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

    const allChildrenWithinCapacity = childDrafts.every((child) => validateCapacity(child, vehicle).valid);
    if (allChildrenWithinCapacity) {
      return {
        splitRequired: true,
        suggestedSplitCount: parts,
        overweightKg: validation.overweightKg,
        overVolumeM3: validation.overVolumeM3,
        childDrafts,
      };
    }

    parts += 1;
  }

  throw new Error('Unable to generate a valid split plan within safe limit.');
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
    id: rule.id,
    shipperId: rule.shipperId,
    truckType: rule.truckType,
    minMileageKm: Number(rule.minMileageKm),
    maxMileageKm: Number(rule.maxMileageKm),
    unitPricePerKm: Number(rule.unitPricePerKm),
    loadingFee: Number(rule.loadingFee),
    insuranceRate: Number(rule.insuranceRate),
  };
}

function normalizeSettlementAdjustmentRule(rule: SettlementAdjustmentRule): SettlementAdjustmentRule {
  return {
    id: rule.id,
    code: rule.code.trim(),
    label: rule.label.trim(),
    category: rule.category,
    mode: rule.mode,
    value: Number(rule.value),
    enabled: Boolean(rule.enabled),
    shipperId: rule.shipperId?.trim() || undefined,
    truckType: rule.truckType,
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

export function deletePricingRule(index: number): PricingRule[] {
  if (!Number.isInteger(index) || index < 0 || index >= pricingRules.length) {
    throw new Error('Pricing rule index is out of range.');
  }
  pricingRules.splice(index, 1);
  return listPricingRules();
}

export function listSettlementAdjustmentRules(): SettlementAdjustmentRule[] {
  return settlementAdjustmentRules.map((rule) => ({ ...rule }));
}

export function replaceSettlementAdjustmentRules(nextRules: SettlementAdjustmentRule[]): void {
  settlementAdjustmentRules.length = 0;
  for (const rule of nextRules) {
    settlementAdjustmentRules.push(normalizeSettlementAdjustmentRule(rule));
  }
}

export function upsertSettlementAdjustmentRule(rule: SettlementAdjustmentRule, index?: number): SettlementAdjustmentRule[] {
  const normalized = normalizeSettlementAdjustmentRule(rule);
  if (!normalized.code) {
    throw new Error('Adjustment rule code is required.');
  }
  if (!normalized.label) {
    throw new Error('Adjustment rule label is required.');
  }
  if (!Number.isFinite(normalized.value) || normalized.value < 0) {
    throw new Error('Adjustment rule value must be greater than or equal to zero.');
  }

  if (typeof index === 'number' && index >= 0 && index < settlementAdjustmentRules.length) {
    settlementAdjustmentRules[index] = normalized;
    return listSettlementAdjustmentRules();
  }

  const existing = settlementAdjustmentRules.findIndex((item) => item.code === normalized.code);
  if (existing >= 0) {
    settlementAdjustmentRules[existing] = normalized;
    return listSettlementAdjustmentRules();
  }

  settlementAdjustmentRules.push(normalized);
  return listSettlementAdjustmentRules();
}

export function deleteSettlementAdjustmentRule(index: number): SettlementAdjustmentRule[] {
  if (!Number.isInteger(index) || index < 0 || index >= settlementAdjustmentRules.length) {
    throw new Error('Settlement adjustment index is out of range.');
  }
  settlementAdjustmentRules.splice(index, 1);
  return listSettlementAdjustmentRules();
}

function resolveAdjustmentAmount(rule: SettlementAdjustmentRule, lineHaul: number): number {
  if (rule.mode === 'LINE_HAUL_RATE') {
    return roundCurrency(lineHaul * rule.value);
  }
  return roundCurrency(rule.value);
}

function shouldApplyAdjustmentRule(rule: SettlementAdjustmentRule, draft: WaybillDraft, vehicle: VehicleProfile): boolean {
  if (!rule.enabled) {
    return false;
  }
  if (rule.shipperId && rule.shipperId !== draft.shipperId) {
    return false;
  }
  if (rule.truckType && rule.truckType !== vehicle.truckType) {
    return false;
  }
  return true;
}

/**
 * Resolve target shard table by waybill number tail hash and month.
 * @param waybillNo waybill business number used for hash distribution.
 * @param createdAt waybill creation time used to build yyyyMM shard prefix.
 * @param shardCount number of physical shards for the month.
 * @returns physical table name such as waybill_202607_1.
 */
export function resolveShardTable(waybillNo: string, createdAt: Date, shardCount = 4): string {
  if (shardCount <= 0) {
    throw new Error('Shard count must be greater than zero.');
  }
  const month = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
  // Keep routing deterministic: same waybillNo always lands on the same shard under one shardCount.
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

/**
 * Calculate fee breakdown and total amount for one waybill draft.
 * @param draft waybill draft containing mileage, extra fees, subsidy and deduction.
 * @returns fee components, total amount and routed shard table snapshot.
 */
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
  // DEDUCTION is stored as negative to make total aggregation and ledger math explicit.
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

  // Settlement adjustments are config-driven so fee tweaks do not require core flow rewrites.
  for (const item of settlementAdjustmentRules) {
    if (!shouldApplyAdjustmentRule(item, draft, vehicle)) {
      continue;
    }
    const amount = resolveAdjustmentAmount(item, lineHaul);
    if (item.category === 'LOADING') {
      fees.push({
        type: 'LOADING',
        label: `${item.label} / ${item.code}`,
        amount,
        formula: item.mode === 'LINE_HAUL_RATE' ? `${lineHaul} x ${item.value}` : `${item.value}`,
      });
      continue;
    }

    fees.push({
      type: 'DEDUCTION',
      label: `${item.label} / ${item.code}`,
      amount: roundCurrency(amount * -1),
      formula: item.mode === 'LINE_HAUL_RATE' ? `${lineHaul} x ${item.value} x -1` : `${item.value} x -1`,
    });
  }

  const totalAmount = sumCurrency(fees.map((item) => item.amount));
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
  const revenue = sumCurrency(waybills.map((item) => item.totalAmount));
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
    settlementAdjustmentRules,
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
