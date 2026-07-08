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

export interface SettlementAdjustmentRule {
  id?: number;
  code: string;
  label: string;
  category: 'LOADING' | 'DEDUCTION';
  mode: 'FIXED' | 'LINE_HAUL_RATE';
  value: number;
  enabled: boolean;
  shipperId?: string;
  truckType?: VehicleProfile['truckType'];
}

export interface FeeComponent {
  type: string;
  label: string;
  amount: number;
  formula: string;
}

export interface WaybillRecord {
  id: string;
  waybillNo: string;
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
  status: string;
  fees: FeeComponent[];
  totalAmount: number;
  createdAt: string;
  podUploaded: boolean;
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

export interface CapacityValidationResult {
  valid: boolean;
  overweightKg: number;
  overVolumeM3: number;
  suggestedSplitCount: number;
}

export interface FeeQuoteResult {
  fees: FeeComponent[];
  totalAmount: number;
  shardTable: string;
}

export interface WaybillQuoteResponse {
  capacity: CapacityValidationResult;
  fee: FeeQuoteResult;
}

export interface BootstrapPayload {
  system: {
    name: string;
    locales: string[];
    auth: string[];
    infra: string[];
  };
  permissions: Record<string, string[]>;
  statusFlow: Array<{ status: string; next: string[] }>;
  references: {
    shippers: PartyProfile[];
    carriers: PartyProfile[];
    drivers: DriverProfile[];
    vehicles: VehicleProfile[];
    pricingRules: PricingRule[];
    settlementAdjustmentRules: SettlementAdjustmentRule[];
  };
}

export interface DashboardPayload {
  metrics: {
    waybillCount: number;
    revenue: number;
    carrierGrossProfit: number;
    onTimeSignRate: number;
  };
  waybills: WaybillRecord[];
  warnings: DocumentWarning[];
}

export interface SplitWaybillCreateResponse {
  splitApplied: true;
  splitCount: number;
  overweightKg: number;
  overVolumeM3: number;
  items: WaybillRecord[];
}

export interface IdempotentTransitionResponse {
  idempotentBlocked: boolean;
  reason: string;
  message: string;
  data: WaybillRecord;
}

export type CreateWaybillResponse = WaybillRecord | SplitWaybillCreateResponse;
export type WaybillTransitionResponse = WaybillRecord | IdempotentTransitionResponse;

export type UserRole = 'ADMIN' | 'SHIPPER' | 'CARRIER';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: UserRole;
  permissions: string[];
}

export interface AuthConfig {
  googleEnabled: boolean;
  googleClientId: string | null;
  devLoginEnabled: boolean;
}

export interface CacheScenarioPayload {
  scenarios: {
    archiveDetailCache: {
      shipperDetailCount: number;
      carrierDetailCount: number;
      vehicleDetailCount: number;
      driverDetailCount: number;
    };
    distributedLockCache: {
      keyPattern: string;
      keyCount: number;
    };
    idempotencyCache: {
      keyPattern: string;
      keyCount: number;
    };
    dashboardHotCache: {
      dashboardCount: number;
      waybillRecentCount: number;
      bootstrapCount: number;
    };
  };
  samples: {
    archiveDetailKeys: string[];
  };
  policy: {
    ttlSeconds: {
      archiveDetail: number;
      archiveNullValue: number;
      bootstrap: number;
      dashboard: number;
      waybillRecent: number;
      idempotencySnapshot: number;
    };
    antiPenetration: string;
    antiBreakdown: string;
  };
}

export interface WaybillImportRow {
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
  idempotencyKey?: string;
}

export interface WaybillImportChunkResult {
  importBatchId: string;
  chunkSize: number;
  created: number;
  failed: number;
  errors: string[];
  durationMs: number;
  heapBeforeMB: number;
  heapAfterMB: number;
  heapDeltaMB: number;
  storage: 'mysql-sharded' | 'memory';
}
