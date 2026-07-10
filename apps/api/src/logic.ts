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

const WAYBILL_ACTIONS = new Set(['PICKUP', 'START_TRANSIT', 'SIGN', 'UPLOAD_POD']);

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
  // 按“分”为最小单位做均摊，确保大批量拆分时总额不漂移、可重复计算。
  const values = Array.from({ length: parts }, (_v, index) => fromCents(index < remainder ? baseCents + 1 : baseCents));
  return values;
}

/**
 * 生成超载/超体积运单的自动拆分方案。
 * 功能：根据车辆双约束（重量 + 体积）计算最小可行拆分份数，并产出每个子单草稿。
 * @param draft 原始运单草稿（包含重量、体积、附加费用等字段）。
 * @returns 拆分结果；当无需拆分时 childDrafts 仅包含原草稿。
 */
export function buildSplitPlan(draft: WaybillDraft): WaybillSplitPlan {
  // 拆分计算保持确定性：同一草稿重复请求必须得到同一拆分结果。
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

  // 逐步增加拆分份数，直到每个子单同时满足重量与体积约束。
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

/**
 * 查找匹配当前运单的运费规则。
 * 功能：按托运方、车型、里程区间定位唯一生效定价规则。
 * @param draft 待计价运单草稿。
 * @param vehicle 已解析车辆档案（用于确定 truckType）。
 * @returns 命中的定价规则。
 */
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

function buildSettlementAdjustmentCode(rule: Pick<SettlementAdjustmentRule, 'code' | 'label' | 'category' | 'mode'>): string {
  const trimmedCode = rule.code.trim();
  if (trimmedCode) {
    return trimmedCode;
  }

  const labelPart = rule.label
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  const base = ['ADJ', rule.category, rule.mode, labelPart].filter(Boolean).join('_');
  return `${base || 'ADJ'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function normalizeSettlementAdjustmentRule(rule: SettlementAdjustmentRule): SettlementAdjustmentRule {
  return {
    id: rule.id,
    code: buildSettlementAdjustmentCode(rule),
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
 * 计算运单应落入的分片表名。
 * 功能：使用“创建月份 + 运单号尾字符哈希”做稳定路由。
 * @param waybillNo 运单号，用于哈希分桶。
 * @param createdAt 创建时间，用于生成 yyyyMM 月分片前缀。
 * @param shardCount 当月物理分片数。
 * @returns 物理分表名，例如 waybill_202607_1。
 */
export function resolveShardTable(waybillNo: string, createdAt: Date, shardCount = 4): string {
  if (shardCount <= 0) {
    throw new Error('Shard count must be greater than zero.');
  }
  const month = `${createdAt.getFullYear()}${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
  // 路由必须可预测：同一 shardCount 下，同一运单号始终命中同一分片。
  const tail = waybillNo.charCodeAt(waybillNo.length - 1) % shardCount;
  return `waybill_${month}_${tail}`;
}

/**
 * 校验运单是否超出车辆双约束。
 * 功能：计算超重/超体积具体数值，并给出建议拆分份数。
 * @param draft 待校验运单草稿。
 * @param vehicle 承运车辆档案。
 * @returns 校验结果（含 valid、overweightKg、overVolumeM3、suggestedSplitCount）。
 */
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
 * 计算运单费用明细与总额。
 * 功能：按基础运价规则 + 结算调整规则，输出可追溯的费用项列表。
 * @param draft 运单草稿（里程、装卸附加费、补贴、扣款等）。
 * @returns 费用明细、总金额，以及路由分表快照。
 */
export function calculateFees(draft: WaybillDraft): FeeCalculationResult {
  // 计价前置校验集中在此，确保报价/建单/分单路径行为一致。
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
  // 正向费用独立成项，保证结算明细可追溯（每项都有明确公式）。
  const lineHaul = roundCurrency(draft.mileageKm * rule.unitPricePerKm);
  const loading = roundCurrency(rule.loadingFee + draft.extraLoadingFee);
  const insurance = roundCurrency(lineHaul * rule.insuranceRate);
  const subsidy = roundCurrency(draft.subsidy);
  // 扣款统一转为负数，后续聚合总额时无需再做额外减法判断。
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

  // 结算调整走配置驱动，支持快速微调而不改核心计价流程。
  for (const item of settlementAdjustmentRules) {
    if (!shouldApplyAdjustmentRule(item, draft, vehicle)) {
      continue;
    }
    const amount = resolveAdjustmentAmount(item, lineHaul);
    if (item.category === 'LOADING') {
      // 装卸类调整始终为正向加项，即使按干线比例计算。
      fees.push({
        type: 'LOADING',
        label: `${item.label} / ${item.code}`,
        amount,
        formula: item.mode === 'LINE_HAUL_RATE' ? `${lineHaul} x ${item.value}` : `${item.value}`,
      });
      continue;
    }

    // 扣款类调整统一负号化，确保下游汇总逻辑只做“同口径求和”。
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

/**
 * 在内存模式创建运单（与数据库模式保持同等幂等语义）。
 * 功能：支持按请求幂等键去重，避免重复创建。
 * @param draft 已通过校验的运单草稿。
 * @param idempotencyKey 可选请求级幂等键。
 * @returns 新建记录，或历史已创建记录。
 */
export function createWaybill(draft: WaybillDraft, idempotencyKey?: string): WaybillRecord {
  // 数据库不可用时，内存路径也必须维持相同的幂等拦截行为。
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

/**
 * 推进运单状态流转（内存模式）。
 * 功能：处理 PICKUP/START_TRANSIT/SIGN/UPLOAD_POD，并在动作级别做幂等拦截。
 * @param waybillId 运单业务ID。
 * @param action 流转动作。
 * @param idempotencyKey 可选幂等键；缺省回退为 waybillId:action。
 * @returns 最新运单快照；若命中幂等则返回当前状态快照。
 */
export function transitionWaybill(
  waybillId: string,
  action: 'PICKUP' | 'START_TRANSIT' | 'SIGN' | 'UPLOAD_POD',
  idempotencyKey?: string,
): WaybillRecord {
  // 流转需同时受“请求幂等键”和“终态幂等”双重保护。
  if (!WAYBILL_ACTIONS.has(action)) {
    throw new Error('Unsupported action.');
  }

  const waybill = waybills.find((item) => item.id === waybillId);
  if (!waybill) {
    throw new Error('Waybill not found.');
  }

  const actionKey = idempotencyKey ?? `${waybillId}:${action}`;
  if (idempotencyStore.has(actionKey)) {
    // 同一动作幂等键命中，说明该动作已被处理或已确认，直接返回当前快照。
    return waybill;
  }

  if (action === 'PICKUP') {
    if (
      waybill.status === 'PICKED_UP'
      || waybill.status === 'IN_TRANSIT'
      || waybill.status === 'SIGNED'
      || waybill.status === 'POD_UPLOADED'
    ) {
      // 已经处于“已提货及之后状态”时，再次提货按幂等成功处理。
      return waybill;
    }
    if (waybill.status !== 'ASSIGNED') {
      throw new Error('Waybill must be assigned before pickup.');
    }
    waybill.status = 'PICKED_UP';
  }

  if (action === 'START_TRANSIT') {
    if (waybill.status === 'IN_TRANSIT' || waybill.status === 'SIGNED' || waybill.status === 'POD_UPLOADED') {
      // 已经处于“运输中及之后状态”时，再次发车按幂等成功处理。
      return waybill;
    }
    if (waybill.status !== 'PICKED_UP') {
      throw new Error('Waybill must be picked up before transit.');
    }
    waybill.status = 'IN_TRANSIT';
  }

  if (action === 'SIGN') {
    if (waybill.status === 'SIGNED' || waybill.status === 'POD_UPLOADED') {
      // 运单签收后再次签收不能重复写入时间戳，直接返回当前状态。
      return waybill;
    }
    waybill.status = 'SIGNED';
    waybill.signedAt = new Date().toISOString();
  }

  if (action === 'UPLOAD_POD') {
    if (waybill.podUploaded) {
      // 回单上传是终态动作：重复上传不再改写状态与时间字段。
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

export function getReferenceDataForPermissions(permissions: string[]) {
  const can = (permission: string) => permissions.includes(permission);

  return {
    shippers: can('waybill:create') || can('master:manage') ? shippers : [],
    carriers: can('waybill:create') || can('master:manage') ? carriers : [],
    drivers: can('master:manage') ? drivers : [],
    vehicles: can('waybill:create') || can('master:manage') ? vehicles : [],
    pricingRules: can('settlement:view') || can('waybill:create') ? pricingRules : [],
    settlementAdjustmentRules: can('settlement:view') ? settlementAdjustmentRules : [],
  };
}

export function getRolePermissions(): Record<string, string[]> {
  return {
    SHIPPER: ['dashboard:view', 'waybill:create', 'waybill:view', 'settlement:view'],
    CARRIER: ['dashboard:view', 'waybill:view', 'pod:upload'],
    ADMIN: ['dashboard:view', 'waybill:create', 'waybill:view', 'waybill:transition', 'pod:upload', 'master:manage', 'settlement:view', 'report:view'],
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
