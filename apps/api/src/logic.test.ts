import { beforeEach, describe, expect, it } from 'vitest';
import { idempotencyStore, pricingRules, settlementAdjustmentRules, waybills, vehicles } from './data.js';
import {
  buildSplitPlan,
  buildDocumentWarnings,
  calculateFees,
  createWaybill,
  listPricingRules,
  replacePricingRules,
  resolveShardTable,
  transitionWaybill,
  upsertSettlementAdjustmentRule,
  validateCapacity,
} from './logic.js';

const baseDraft = {
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
};

describe('waybill logic', () => {
  beforeEach(() => {
    waybills.length = 0;
    idempotencyStore.clear();
    settlementAdjustmentRules.length = 0;
  });

  it('applies updated pricing rule without changing calculate flow', () => {
    const original = listPricingRules();
    try {
      const tuned = original.map((item) => ({ ...item }));
      const target = tuned.find(
        (item) => item.shipperId === 'shipper-1' && item.truckType === '9.6M' && item.minMileageKm === 301,
      );
      expect(target).toBeDefined();
      target!.unitPricePerKm = 8.1;
      replacePricingRules(tuned);

      const result = calculateFees(baseDraft);
      const lineHaul = result.fees.find((item) => item.type === 'LINE_HAUL');
      expect(lineHaul?.amount).toBe(3402);
      expect(result.totalAmount).toBe(3772.82);
    } finally {
      replacePricingRules(original);
    }
  });

  it('applies configurable loading and deduction adjustments automatically', () => {
    upsertSettlementAdjustmentRule({
      code: 'LOAD_EXTRA_NIGHT',
      label: 'Night loading surcharge',
      category: 'LOADING',
      mode: 'FIXED',
      value: 35,
      enabled: true,
      shipperId: 'shipper-1',
    });

    upsertSettlementAdjustmentRule({
      code: 'DEDUCT_DAMAGE_A',
      label: 'Damage deduction type A',
      category: 'DEDUCTION',
      mode: 'FIXED',
      value: 12,
      enabled: true,
      shipperId: 'shipper-1',
    });

    const result = calculateFees(baseDraft);

    expect(result.fees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Night loading surcharge / LOAD_EXTRA_NIGHT', amount: 35 }),
        expect.objectContaining({ label: 'Damage deduction type A / DEDUCT_DAMAGE_A', amount: -12 }),
      ]),
    );
    expect(result.totalAmount).toBe(3583.3);
  });

  it('calculates mixed positive and negative fees with two-decimal precision', () => {
    const result = calculateFees(baseDraft);

    expect(result.totalAmount).toBe(3560.3);
    expect(result.fees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'LINE_HAUL', amount: 3192 }),
        expect.objectContaining({ type: 'LOADING', amount: 260 }),
        expect.objectContaining({ type: 'INSURANCE', amount: 38.3 }),
        expect.objectContaining({ type: 'SUBSIDY', amount: 120 }),
        expect.objectContaining({ type: 'DEDUCTION', amount: -50 }),
      ]),
    );
  });

  it('supports zero mileage and negative subsidy edge cases', () => {
    const result = calculateFees({
      ...baseDraft,
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
    });

    expect(result.totalAmount).toBe(100);
  });

  it('supports zero freight scenario and keeps total at zero', () => {
    const result = calculateFees({
      ...baseDraft,
      shipperId: 'shipper-2',
      carrierId: 'carrier-2',
      vehicleId: 'vehicle-2',
      mileageKm: 0,
      weightKg: 1000,
      volumeM3: 2,
      goodsName: 'zero-freight',
      extraLoadingFee: -120,
      subsidy: 0,
      deduction: 0,
    });

    expect(result.fees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'LINE_HAUL', amount: 0 }),
        expect.objectContaining({ type: 'LOADING', amount: 0 }),
        expect.objectContaining({ type: 'INSURANCE', amount: 0 }),
      ]),
    );
    expect(result.totalAmount).toBe(0);
  });

  it('keeps cent-level precision with mixed signs and no floating drift', () => {
    const result = calculateFees({
      ...baseDraft,
      shipperId: 'shipper-2',
      carrierId: 'carrier-2',
      vehicleId: 'vehicle-2',
      mileageKm: 10,
      weightKg: 100,
      volumeM3: 1,
      goodsName: 'precision-check',
      extraLoadingFee: 0.1,
      subsidy: 0.2,
      deduction: 0.3,
    });

    expect(result.fees).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'LINE_HAUL', amount: 69 }),
        expect.objectContaining({ type: 'LOADING', amount: 120.1 }),
        expect.objectContaining({ type: 'INSURANCE', amount: 0.69 }),
        expect.objectContaining({ type: 'SUBSIDY', amount: 0.2 }),
        expect.objectContaining({ type: 'DEDUCTION', amount: -0.3 }),
      ]),
    );
    expect(result.totalAmount).toBe(189.69);
  });

  it('allows negative total waybill and preserves detailed fee items', () => {
    const record = createWaybill(
      {
        ...baseDraft,
        shipperId: 'shipper-2',
        carrierId: 'carrier-2',
        vehicleId: 'vehicle-2',
        mileageKm: 0,
        weightKg: 100,
        volumeM3: 1,
        goodsName: 'negative-total',
        extraLoadingFee: 0,
        subsidy: 0,
        deduction: 180,
      },
      'idem-negative-total',
    );

    expect(record.totalAmount).toBe(-60);
    expect(record.fees).toHaveLength(5);
    expect(record.fees.find((item) => item.type === 'DEDUCTION')?.amount).toBe(-180);
    expect(waybills[0].totalAmount).toBe(-60);
  });

  it('rejects empty waybills', () => {
    expect(() => calculateFees({ ...baseDraft, goodsName: '   ' })).toThrow('Empty waybill is not allowed.');
  });

  it('checks weight and volume constraints and returns split suggestion', () => {
    const vehicle = vehicles.find((item) => item.id === 'vehicle-2');
    expect(vehicle).toBeDefined();

    const validation = validateCapacity(
      {
        ...baseDraft,
        vehicleId: 'vehicle-2',
        weightKg: 21000,
        volumeM3: 70,
      },
      vehicle!,
    );

    expect(validation.valid).toBe(false);
    expect(validation.overweightKg).toBe(11000);
    expect(validation.overVolumeM3).toBe(38);
    expect(validation.suggestedSplitCount).toBe(3);
  });

  it('builds split plan and ensures each child draft is within capacity', () => {
    const plan = buildSplitPlan({
      ...baseDraft,
      vehicleId: 'vehicle-2',
      shipperId: 'shipper-2',
      carrierId: 'carrier-2',
      weightKg: 21000,
      volumeM3: 70,
      goodsName: 'split-goods',
    });

    expect(plan.splitRequired).toBe(true);
    expect(plan.suggestedSplitCount).toBe(3);
    expect(plan.childDrafts).toHaveLength(3);

    const vehicle = vehicles.find((item) => item.id === 'vehicle-2')!;
    for (const child of plan.childDrafts) {
      const childCheck = validateCapacity(child, vehicle);
      expect(childCheck.valid).toBe(true);
    }
  });

  it('enforces idempotent waybill creation', () => {
    const first = createWaybill(baseDraft, 'idem-create-1');
    const second = createWaybill(baseDraft, 'idem-create-1');

    expect(second.id).toBe(first.id);
    expect(waybills).toHaveLength(1);
  });

  it('blocks pod upload before sign and keeps sign/upload idempotent', () => {
    const created = createWaybill(baseDraft, 'idem-create-2');

    expect(() => transitionWaybill(created.id, 'UPLOAD_POD', 'idem-upload-0')).toThrow(
      'Waybill must be signed before POD upload.',
    );

    const signed = transitionWaybill(created.id, 'SIGN', 'idem-sign-1');
    const signedAgain = transitionWaybill(created.id, 'SIGN', 'idem-sign-1');
    const uploaded = transitionWaybill(created.id, 'UPLOAD_POD', 'idem-upload-1');
    const uploadedAgain = transitionWaybill(created.id, 'UPLOAD_POD', 'idem-upload-1');

    expect(signed.status).toBe('POD_UPLOADED');
    expect(signedAgain.status).toBe('POD_UPLOADED');
    expect(uploaded.status).toBe('POD_UPLOADED');
    expect(uploadedAgain.status).toBe('POD_UPLOADED');
    expect(waybills).toHaveLength(1);
  });

  it('classifies driver and vehicle document warnings including invalid dates', () => {
    const warnings = buildDocumentWarnings();

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'DRIVER', entityId: 'driver-2', status: 'EXPIRED' }),
        expect.objectContaining({ entityType: 'VEHICLE', entityId: 'vehicle-2', status: 'INVALID' }),
      ]),
    );
  });

  it('routes waybills to monthly shard tables', () => {
    const table = resolveShardTable('WB12345678', new Date('2026-07-06T00:00:00Z'));
    expect(table).toMatch(/^waybill_202607_[0-3]$/);
  });

  it('supports shard expansion by shardCount parameter', () => {
    const table4 = resolveShardTable('WB00000005', new Date('2026-07-06T00:00:00Z'), 4);
    const table8 = resolveShardTable('WB00000005', new Date('2026-07-06T00:00:00Z'), 8);

    expect(table4).toBe('waybill_202607_1');
    expect(table8).toBe('waybill_202607_5');
  });
});
