export type Locale = 'zh-CN' | 'en-US';

export type Role = 'SHIPPER' | 'CARRIER' | 'ADMIN';

export type WaybillStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'SIGNED'
  | 'POD_UPLOADED';

export type FeeComponentType =
  | 'LINE_HAUL'
  | 'LOADING'
  | 'INSURANCE'
  | 'SUBSIDY'
  | 'DEDUCTION';

export interface PartyProfile {
  id: string;
  code: string;
  name: string;
  contactName: string;
  phone: string;
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  licenseNumber: string;
  licenseExpiry: string;
}

export interface VehicleProfile {
  id: string;
  plateNumber: string;
  truckType: '4.2M' | '6.8M' | '9.6M' | '17.5M';
  maxWeightKg: number;
  maxVolumeM3: number;
  roadPermitExpiry: string;
  assignedDriverId: string;
}

export interface PricingRule {
  id?: number;
  shipperId: string;
  truckType: VehicleProfile['truckType'];
  minMileageKm: number;
  maxMileageKm: number;
  unitPricePerKm: number;
  loadingFee: number;
  insuranceRate: number;
}

export type SettlementAdjustmentCategory = 'LOADING' | 'DEDUCTION';

export type SettlementAdjustmentMode = 'FIXED' | 'LINE_HAUL_RATE';

export interface SettlementAdjustmentRule {
  id?: number;
  code: string;
  label: string;
  category: SettlementAdjustmentCategory;
  mode: SettlementAdjustmentMode;
  value: number;
  enabled: boolean;
  shipperId?: string;
  truckType?: VehicleProfile['truckType'];
}

export interface FeeComponent {
  type: FeeComponentType;
  label: string;
  amount: number;
  formula: string;
}

export interface WaybillDraft {
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
}

export interface WaybillRecord extends WaybillDraft {
  id: string;
  waybillNo: string;
  status: WaybillStatus;
  fees: FeeComponent[];
  totalAmount: number;
  createdAt: string;
  podUploaded: boolean;
  signedAt?: string;
  podUploadedAt?: string;
  shardTable: string;
}

export interface CapacityValidationResult {
  valid: boolean;
  overweightKg: number;
  overVolumeM3: number;
  suggestedSplitCount: number;
}

export interface WaybillSplitPlan {
  splitRequired: boolean;
  suggestedSplitCount: number;
  overweightKg: number;
  overVolumeM3: number;
  childDrafts: WaybillDraft[];
}

export interface FeeCalculationResult {
  fees: FeeComponent[];
  totalAmount: number;
  shardTable: string;
}

export interface DocumentWarning {
  entityType: 'DRIVER' | 'VEHICLE';
  entityId: string;
  entityName: string;
  documentName: string;
  expiryDate: string;
  status: 'EXPIRED' | 'EXPIRING_SOON' | 'INVALID';
  daysRemaining: number | null;
}
