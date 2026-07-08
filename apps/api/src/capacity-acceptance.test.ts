import { beforeEach, describe, expect, it } from 'vitest';
import { waybills, vehicles } from './data.js';
import { buildSplitPlan, validateCapacity } from './logic.js';

const draft = {
  shipperId: 'shipper-2',
  carrierId: 'carrier-2',
  vehicleId: 'vehicle-2',
  mileageKm: 120,
  weightKg: 0,
  volumeM3: 0,
  goodsName: 'capacity-acceptance',
  extraLoadingFee: 0,
  subsidy: 0,
  deduction: 0,
};

describe('capacity acceptance', () => {
  beforeEach(() => {
    waybills.length = 0;
  });

  it('validates dual constraints and reports exceeded values', () => {
    const vehicle = vehicles.find((item) => item.id === 'vehicle-2');
    expect(vehicle).toBeDefined();

    const check = validateCapacity(
      {
        ...draft,
        weightKg: vehicle!.maxWeightKg + 1500,
        volumeM3: vehicle!.maxVolumeM3 + 8,
      },
      vehicle!,
    );

    expect(check.valid).toBe(false);
    expect(check.overweightKg).toBe(1500);
    expect(check.overVolumeM3).toBe(8);
    expect(check.suggestedSplitCount).toBeGreaterThanOrEqual(2);
  });

  it('fails split planning for impossible capacity configuration to prevent invalid persistence', () => {
    const vehicle = vehicles.find((item) => item.id === 'vehicle-2');
    expect(vehicle).toBeDefined();

    const originalWeight = vehicle!.maxWeightKg;
    try {
      vehicle!.maxWeightKg = 0;

      expect(() =>
        buildSplitPlan({
          ...draft,
          weightKg: 100,
          volumeM3: 1,
        }),
      ).toThrow('Vehicle capacity configuration is invalid for split planning.');
    } finally {
      vehicle!.maxWeightKg = originalWeight;
    }
  });
});
