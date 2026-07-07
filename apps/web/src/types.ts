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
  shipperId: string;
  truckType: VehicleProfile['truckType'];
  minMileageKm: number;
  maxMileageKm: number;
  unitPricePerKm: number;
  loadingFee: number;
  insuranceRate: number;
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
