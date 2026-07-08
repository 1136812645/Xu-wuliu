import type {
  DriverProfile,
  PartyProfile,
  PricingRule,
  SettlementAdjustmentRule,
  VehicleProfile,
  WaybillRecord,
} from './domain.js';

export const shippers: PartyProfile[] = [
  {
    id: 'shipper-1',
    code: 'SHP001',
    name: '华东家电',
    contactName: '王丽',
    phone: '13800000001',
  },
  {
    id: 'shipper-2',
    code: 'SHP002',
    name: 'Northwind Retail',
    contactName: 'John Smith',
    phone: '13800000002',
  },
];

export const carriers: PartyProfile[] = [
  {
    id: 'carrier-1',
    code: 'CAR001',
    name: '远达干线',
    contactName: '陈锋',
    phone: '13900000001',
  },
  {
    id: 'carrier-2',
    code: 'CAR002',
    name: 'Blue Lane Carrier',
    contactName: 'Mia Brown',
    phone: '13900000002',
  },
];

export const drivers: DriverProfile[] = [
  {
    id: 'driver-1',
    name: '李明',
    phone: '13700000001',
    licenseNumber: 'DL-2024-001',
    licenseExpiry: '2026-07-20',
  },
  {
    id: 'driver-2',
    name: 'Grace Wilson',
    phone: '13700000002',
    licenseNumber: 'DL-2023-008',
    licenseExpiry: '2026-06-28',
  },
];

export const vehicles: VehicleProfile[] = [
  {
    id: 'vehicle-1',
    plateNumber: '沪A12345',
    truckType: '9.6M',
    maxWeightKg: 18000,
    maxVolumeM3: 55,
    roadPermitExpiry: '2026-07-14',
    assignedDriverId: 'driver-1',
  },
  {
    id: 'vehicle-2',
    plateNumber: '苏B99881',
    truckType: '6.8M',
    maxWeightKg: 10000,
    maxVolumeM3: 32,
    roadPermitExpiry: 'invalid-date',
    assignedDriverId: 'driver-2',
  },
  {
    id: 'vehicle-3',
    plateNumber: '浙C77889',
    truckType: '9.6M',
    maxWeightKg: 18000,
    maxVolumeM3: 55,
    roadPermitExpiry: '2026-08-31',
    assignedDriverId: 'driver-1',
  },
];

export const pricingRules: PricingRule[] = [
  {
    shipperId: 'shipper-1',
    truckType: '9.6M',
    minMileageKm: 0,
    maxMileageKm: 300,
    unitPricePerKm: 8.2,
    loadingFee: 180,
    insuranceRate: 0.012,
  },
  {
    shipperId: 'shipper-1',
    truckType: '9.6M',
    minMileageKm: 301,
    maxMileageKm: 2000,
    unitPricePerKm: 7.6,
    loadingFee: 180,
    insuranceRate: 0.012,
  },
  {
    shipperId: 'shipper-2',
    truckType: '6.8M',
    minMileageKm: 0,
    maxMileageKm: 1500,
    unitPricePerKm: 6.9,
    loadingFee: 120,
    insuranceRate: 0.01,
  },
  {
    shipperId: 'shipper-2',
    truckType: '9.6M',
    minMileageKm: 0,
    maxMileageKm: 300,
    unitPricePerKm: 8.1,
    loadingFee: 170,
    insuranceRate: 0.011,
  },
  {
    shipperId: 'shipper-2',
    truckType: '9.6M',
    minMileageKm: 301,
    maxMileageKm: 2000,
    unitPricePerKm: 7.5,
    loadingFee: 170,
    insuranceRate: 0.011,
  },
];

export const settlementAdjustmentRules: SettlementAdjustmentRule[] = [];

export const waybills: WaybillRecord[] = [];

export const idempotencyStore = new Map<string, string>();
