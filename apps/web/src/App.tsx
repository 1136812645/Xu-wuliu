import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  createCarrier,
  createDriver,
  createShipper,
  createVehicle,
  deletePricingRule,
  deleteSettlementAdjustmentRule,
  createWaybill,
  devLogin,
  deleteCarrier,
  deleteDriver,
  deleteShipper,
  deleteVehicle,
  fetchSettlementAdjustmentRules,
  fetchAuthConfig,
  fetchAuthMe,
  fetchBootstrap,
  fetchCacheScenarios,
  fetchDashboard,
  fetchPricingRules,
  importWaybillChunk,
  fetchWarnings,
  fetchWaybills,
  loginWithGoogle,
  loginWithPassword,
  logout,
  pickupWaybill,
  quoteWaybill,
  registerWithPassword,
  savePricingRule,
  saveSettlementAdjustmentRule,
  signWaybill,
  startTransitWaybill,
  setAuthToken,
  uploadPod,
  updateCarrier,
  updateDriver,
  updateShipper,
  updateVehicle,
} from './api';
import type {
  AuthConfig,
  CacheScenarioPayload,
  AuthUser,
  BootstrapPayload,
  DashboardPayload,
  DocumentWarning,
  DriverProfile,
  PartyProfile,
  PricingRule,
  SettlementAdjustmentRule,
  VehicleProfile,
  WaybillImportChunkResult,
  WaybillImportRow,
  WaybillRecord,
  WaybillTransitionResponse,
} from './types';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

type NavKey = 'overview' | 'waybills' | 'import' | 'warnings' | 'archives' | 'settlement' | 'architecture';
type WarningFilter = 'ALL' | 'EXPIRED';
type Locale = 'zh-CN' | 'en-US';
type ArchiveTab = 'shippers' | 'carriers' | 'vehicles' | 'drivers';

const LOCALE_STORAGE_KEY = 'waybill-admin-locale';
const WAYBILL_PAGE_SIZE = 10;

const I18N = {
  'zh-CN': {
    loading: '正在加载内部管理控制台...',
    loadFailed: '加载失败：',
    internalSuite: '内部物流平台',
    title: '运单 & 结算管理后台',
    subtitle: '面向货主、承运商、管理员的多语言内部控制台，覆盖运单、结算、档案预警与分布式架构治理。',
    navOverview: '总览',
    navWaybills: '运单中心',
    navImport: '批量导入',
    navWarnings: '证件预警',
    navArchives: '基础档案',
    navSettlement: '结算规则',
    navArchitecture: '架构方案',
    language: '语言',
    ssoDesc: '支持 Google OAuth2 登录与 RBAC 权限控制。',
    permissionsSuffix: '个权限',
    heroEyebrow: '双语管理体验',
    metricWaybills: '运单量',
    metricWaybillsDesc: '支持高并发开单与分表扩展',
    metricRevenue: '营收',
    metricRevenueDesc: '费用明细可追溯，支持负金额',
    metricProfit: '承运商毛利',
    metricProfitDesc: '报表页缓存热点统计结果',
    metricSignRate: '签收率',
    metricSignRateDesc: '幂等签收与回单上传保护',
    recentWaybills: '最近运单',
    recentWaybillsSub: '最新创建记录',
    warningTitle: '证件预警',
    warningSub: '司机与车辆档案状态',
    waybillNo: '运单号',
    goods: '货物',
    status: '状态',
    amount: '金额',
    shard: '分表',
    createWaybillTitle: '新建运单',
    createWaybillHint: '运力约束与费用明细',
    fieldShipper: '货主',
    fieldCarrier: '承运商',
    fieldVehicle: '车辆',
    fieldMileage: '里程 km',
    fieldWeight: '重量 kg',
    fieldVolume: '体积 m3',
    fieldGoodsName: '货物名称',
    fieldLoadingFee: '附加装卸费',
    fieldSubsidy: '补贴',
    fieldDeduction: '扣款',
    createButton: '创建运单',
    waybillListTitle: '运单列表',
    waybillListHint: '幂等操作与分片路由',
    waybillPageSummary: '第 {current}/{total} 页（每页最多 {size} 条）',
    pagePrev: '上一页',
    pageNext: '下一页',
    totalFee: '总费用',
    alertsTitle: '档案与证件预警',
    alertsHint: '红色标记过期/临期数据，非法日期不阻塞页面',
    filterAll: '全部',
    filterExpired: '仅证件过期',
    remainDays: '天',
    invalidDate: '非法日期',
    normal: '正常',
    vehicleCapacity: '载重',
    vehicleVolume: '体积',
    roadPermit: '道路许可证',
    driverLicenseExpiry: '驾驶证到期',
    settlementTitle: '结算规则配置化',
    settlementHint: '改配置，不改核心流程',
    settlementEditRules: '阶梯运价编辑',
    settlementEditAdjustments: '装卸费 / 扣款规则配置',
    settlementCode: '规则编码',
    settlementLabel: '规则名称',
    settlementCategory: '规则分类',
    settlementMode: '计算模式',
    settlementValue: '规则值',
    settlementEnabled: '启用',
    settlementScope: '适用范围',
    settlementReloadHint: '管理员修改后直接写入配置表，新建运单自动按新规则计算。',
    settlementWaybillTitle: '结算应付明细',
    settlementWaybillHint: '每票应付金额与费用项可追溯，支持负金额展示',
    shipper: '货主',
    truckType: '车型',
    mileageRange: '里程区间',
    unitPrice: '单价',
    loadingFee: '装卸费',
    insuranceRate: '保费率',
    payableAmount: '应付金额',
    feeDetails: '费用明细',
    negativePayableTag: '负金额应付',
    noSettlementData: '暂无结算数据',
    timelineTitle: '状态流转 + MQ 事件',
    timelineHint: '运单状态使用 RabbitMQ 投递事件，支持幂等消费与死信隔离',
    endStatus: '结束',
    architectureTitle: '系统架构',
    architectureHint: '单机可跑，分布式可扩',
    archWeb: 'React + Vite 管理后台，支持中英文和 Google 登录入口。',
    archApp: 'Node.js MVC API，幂等键、RBAC、分布式锁、运费核算、报表聚合。',
    archMq: '运单状态消息、重试队列、死信队列、消费幂等记录。',
    archDb: '按月 + hash 分表，路由表支持未来扩容迁移。',
    archRedis: '基础档案缓存、分布式锁、幂等请求记录、统计缓存。',
    archObs: '运行日志、MQ 消费日志、业务审计日志，支撑问题复盘。',
    cacheBoardTitle: '缓存场景验收看板',
    cacheBoardHint: '实时展示 Redis Key 覆盖、缓存策略与防护信息。',
    cacheArchiveCoverage: '基础档案缓存',
    cacheLockCoverage: '分布式锁缓存',
    cacheIdemCoverage: '幂等记录缓存',
    cacheDashboardCoverage: '首页热点缓存',
    cacheSampleKeys: '档案缓存样例 Key',
    cachePolicy: '缓存策略',
    cacheTtl: 'TTL',
    cachePenetration: '穿透防护',
    cacheBreakdown: '击穿防护',
    initNotReady: '初始化数据尚未加载完成，请稍后再试。',
    shipperMissing: '货主不存在，请从下拉列表选择有效货主。',
    carrierMissing: '承运商不存在，请从下拉列表选择有效承运商。',
    vehicleMissing: '车辆不存在，请从下拉列表选择有效车辆。',
    pricingMissing: '当前货主在该车辆类型与里程区间未配置定价规则，请调整货主/车辆/里程后重试。',
    createdOk: '已创建运单',
    totalAmountLabel: '总运费',
    createFailed: '创建失败',
    archivesTitle: '基础档案管理',
    archivesHint: '维护货主、承运商、车辆、司机资料；证件到期状态实时提醒。',
    tabShippers: '货主',
    tabCarriers: '承运商',
    tabVehicles: '车辆',
    tabDrivers: '司机',
    colId: 'ID',
    colCode: '编码',
    colName: '名称',
    colContact: '联系人',
    colPhone: '电话',
    colPlateNo: '车牌',
    colDriver: '司机',
    colLicenseNo: '证件号',
    colExpiry: '到期日',
    colActions: '操作',
    actionEdit: '编辑',
    actionCancelEdit: '取消编辑',
    actionCreate: '新增',
    actionDelete: '删除',
    actionSave: '保存',
    actionQuote: '试算校验',
    actionPickup: '提货',
    actionStartTransit: '在途',
    actionSign: '签收',
    actionUploadPod: '上传回单',
    actionDupSignTest: '重复签收测试',
    actionDupPodTest: '重复回单测试',
    importTitle: '批量导入（10k+）',
    importHint: 'CSV流式读取 + 分批上传，避免页面卡顿与一次性内存暴涨。',
    importPickFile: '选择 CSV 文件',
    importChunkSize: '分批大小',
    importStart: '开始导入',
    importBusy: '导入中，请勿关闭页面...',
    importDone: '导入完成',
    importProgress: '进度',
    importCreated: '成功',
    importFailed: '失败',
    importDuration: '耗时',
    importStorage: '存储模式',
    importPeakHeap: '服务端峰值堆内存(MB)',
    importSelectFileFirst: '请先选择 CSV 文件。',
    splitAppliedHint: '超量已自动拆分',
    formCode: '编码',
    formName: '名称',
    formContactName: '联系人',
    formPhone: '联系电话',
    formPlateNo: '车牌号',
    formAssignedDriver: '绑定司机',
    formDriverName: '司机姓名',
    formLicenseNo: '驾驶证号',
    formLicenseExpiry: '驾驶证到期日',
    formRoadPermitExpiry: '道路运输证到期日',
    saveSuccess: '保存成功，档案已刷新。',
    saveFailed: '保存失败',
    loginTitle: '账号登录',
    loginHint: '请先登录后再进行业务操作。',
    loginByGoogle: 'Google 登录',
    googleNotConfigured: 'Google 登录未启用，请在服务端配置 GOOGLE_CLIENT_ID。',
    googleLoading: 'Google 登录组件加载中...',
    googleUnavailable: 'Google 登录按钮加载失败，请检查网络或浏览器插件后重试。',
    googleRetry: '重试加载 Google 登录',
    devLogin: '开发模式登录',
    passwordLogin: '账号密码登录',
    registerAccount: '注册账号',
    password: '密码',
    passwordHint: '至少8位字符',
    loginButton: '登录',
    registerButton: '注册并登录',
    devRole: '角色',
    devEmail: '邮箱',
    devName: '姓名',
    logout: '退出登录',
    noPermission: '当前账号没有权限执行该操作',
  },
  'en-US': {
    loading: 'Loading internal admin console...',
    loadFailed: 'Failed to load: ',
    internalSuite: 'Internal Logistics Suite',
    title: 'Waybill & Settlement Admin',
    subtitle: 'A bilingual internal console for shippers, carriers, and admins, covering waybills, settlement, archive alerts, and distributed architecture governance.',
    navOverview: 'Overview',
    navWaybills: 'Waybills',
    navImport: 'Batch Import',
    navWarnings: 'Alerts',
    navArchives: 'Master Data',
    navSettlement: 'Settlement',
    navArchitecture: 'Architecture',
    language: 'Language',
    ssoDesc: 'Supports Google OAuth2 login and RBAC access control.',
    permissionsSuffix: ' permissions',
    heroEyebrow: 'Bilingual Admin Experience',
    metricWaybills: 'Waybill Count',
    metricWaybillsDesc: 'Supports high-concurrency creation and shard scaling',
    metricRevenue: 'Revenue',
    metricRevenueDesc: 'Fee details are traceable and support negative amounts',
    metricProfit: 'Carrier Gross Profit',
    metricProfitDesc: 'Dashboard uses hot-cache aggregated stats',
    metricSignRate: 'Sign-off Rate',
    metricSignRateDesc: 'Idempotent sign-off and POD upload protection',
    recentWaybills: 'Recent Waybills',
    recentWaybillsSub: 'Recently created records',
    warningTitle: 'Document Alerts',
    warningSub: 'Driver and vehicle archive status',
    waybillNo: 'Waybill No.',
    goods: 'Goods',
    status: 'Status',
    amount: 'Amount',
    shard: 'Shard',
    createWaybillTitle: 'Create Waybill',
    createWaybillHint: 'Capacity guard + fee details',
    fieldShipper: 'Shipper',
    fieldCarrier: 'Carrier',
    fieldVehicle: 'Vehicle',
    fieldMileage: 'Mileage km',
    fieldWeight: 'Weight kg',
    fieldVolume: 'Volume m3',
    fieldGoodsName: 'Goods Name',
    fieldLoadingFee: 'Extra Loading Fee',
    fieldSubsidy: 'Subsidy',
    fieldDeduction: 'Deduction',
    createButton: 'Create Waybill',
    waybillListTitle: 'Waybill List',
    waybillListHint: 'Idempotent operations and shard routing',
    waybillPageSummary: 'Page {current}/{total} (max {size} items per page)',
    pagePrev: 'Previous',
    pageNext: 'Next',
    totalFee: 'Total Amount',
    alertsTitle: 'Archive & Document Alerts',
    alertsHint: 'Expired or expiring records are highlighted; invalid dates do not block the page.',
    filterAll: 'All',
    filterExpired: 'Expired Only',
    remainDays: 'days left',
    invalidDate: 'Invalid date',
    normal: 'Normal',
    vehicleCapacity: 'Weight',
    vehicleVolume: 'Volume',
    roadPermit: 'Road Permit',
    driverLicenseExpiry: 'License Expiry',
    settlementTitle: 'Configurable Settlement Rules',
    settlementHint: 'Change config, not core flow',
    settlementEditRules: 'Tiered Pricing Editor',
    settlementEditAdjustments: 'Loading / Deduction Rule Config',
    settlementCode: 'Code',
    settlementLabel: 'Label',
    settlementCategory: 'Category',
    settlementMode: 'Mode',
    settlementValue: 'Value',
    settlementEnabled: 'Enabled',
    settlementScope: 'Scope',
    settlementReloadHint: 'Admin edits are written to config tables and apply to newly created waybills immediately.',
    settlementWaybillTitle: 'Settlement Payables',
    settlementWaybillHint: 'Traceable payable amount and fee items per waybill, including negative totals',
    shipper: 'Shipper',
    truckType: 'Truck Type',
    mileageRange: 'Mileage Range',
    unitPrice: 'Unit Price',
    loadingFee: 'Loading Fee',
    insuranceRate: 'Insurance Rate',
    payableAmount: 'Payable Amount',
    feeDetails: 'Fee Details',
    negativePayableTag: 'Negative Payable',
    noSettlementData: 'No settlement data yet',
    timelineTitle: 'Status Flow + MQ Events',
    timelineHint: 'Waybill status events are published via RabbitMQ with idempotent consumption and dead-letter isolation.',
    endStatus: 'END',
    architectureTitle: 'System Architecture',
    architectureHint: 'Runs on single-node, scales in distributed mode',
    archWeb: 'React + Vite admin portal with bilingual support and Google login entry.',
    archApp: 'Node.js MVC API with idempotency key, RBAC, distributed lock, fee engine, and reporting.',
    archMq: 'Waybill status messaging, retry queue, dead-letter queue, and idempotent consume records.',
    archDb: 'Monthly + hash sharding with route config prepared for future scaling migration.',
    archRedis: 'Archive cache, distributed lock, idempotency snapshots, and metrics cache.',
    archObs: 'Runtime logs, MQ consume logs, and business audit logs for troubleshooting.',
    cacheBoardTitle: 'Cache Scenario Acceptance Board',
    cacheBoardHint: 'Live Redis key coverage and cache protection policies.',
    cacheArchiveCoverage: 'Master Data Cache',
    cacheLockCoverage: 'Distributed Lock Cache',
    cacheIdemCoverage: 'Idempotency Cache',
    cacheDashboardCoverage: 'Dashboard Hot Cache',
    cacheSampleKeys: 'Archive Cache Sample Keys',
    cachePolicy: 'Cache Policy',
    cacheTtl: 'TTL',
    cachePenetration: 'Penetration Guard',
    cacheBreakdown: 'Breakdown Guard',
    initNotReady: 'Initialization is not ready yet, please retry in a moment.',
    shipperMissing: 'Shipper does not exist. Please choose a valid shipper from the list.',
    carrierMissing: 'Carrier does not exist. Please choose a valid carrier from the list.',
    vehicleMissing: 'Vehicle does not exist. Please choose a valid vehicle from the list.',
    pricingMissing: 'No pricing rule matched current shipper, truck type, and mileage range. Please adjust and retry.',
    createdOk: 'Waybill created',
    totalAmountLabel: 'Total amount',
    createFailed: 'Create failed',
    archivesTitle: 'Master Data Maintenance',
    archivesHint: 'Maintain shipper, carrier, vehicle, and driver profiles with real-time expiry reminders.',
    tabShippers: 'Shippers',
    tabCarriers: 'Carriers',
    tabVehicles: 'Vehicles',
    tabDrivers: 'Drivers',
    colId: 'ID',
    colCode: 'Code',
    colName: 'Name',
    colContact: 'Contact',
    colPhone: 'Phone',
    colPlateNo: 'Plate No.',
    colDriver: 'Driver',
    colLicenseNo: 'License No.',
    colExpiry: 'Expiry',
    colActions: 'Actions',
    actionEdit: 'Edit',
    actionCancelEdit: 'Cancel Edit',
    actionCreate: 'Create',
    actionDelete: 'Delete',
    actionSave: 'Save',
    actionQuote: 'Quote Validate',
    actionPickup: 'Pickup',
    actionStartTransit: 'Start Transit',
    actionSign: 'Sign',
    actionUploadPod: 'Upload POD',
    actionDupSignTest: 'Duplicate Sign Test',
    actionDupPodTest: 'Duplicate POD Test',
    importTitle: 'Batch Import (10k+)',
    importHint: 'CSV streaming read + chunk upload to avoid UI freeze and memory spikes.',
    importPickFile: 'Choose CSV File',
    importChunkSize: 'Chunk Size',
    importStart: 'Start Import',
    importBusy: 'Import is running. Please keep this page open...',
    importDone: 'Import completed',
    importProgress: 'Progress',
    importCreated: 'Created',
    importFailed: 'Failed',
    importDuration: 'Duration',
    importStorage: 'Storage',
    importPeakHeap: 'Server Peak Heap(MB)',
    importSelectFileFirst: 'Please choose a CSV file first.',
    splitAppliedHint: 'Auto split applied',
    formCode: 'Code',
    formName: 'Name',
    formContactName: 'Contact Name',
    formPhone: 'Phone',
    formPlateNo: 'Plate Number',
    formAssignedDriver: 'Assigned Driver',
    formDriverName: 'Driver Name',
    formLicenseNo: 'License Number',
    formLicenseExpiry: 'License Expiry Date',
    formRoadPermitExpiry: 'Road Permit Expiry Date',
    saveSuccess: 'Saved successfully, references refreshed.',
    saveFailed: 'Save failed',
    loginTitle: 'Sign In',
    loginHint: 'Please sign in before operating business actions.',
    loginByGoogle: 'Google Sign In',
    googleNotConfigured: 'Google sign-in is disabled. Configure GOOGLE_CLIENT_ID on the server.',
    googleLoading: 'Loading Google sign-in widget...',
    googleUnavailable: 'Failed to load Google sign-in button. Check network or browser extensions and retry.',
    googleRetry: 'Retry Google sign-in load',
    devLogin: 'Dev Login',
    passwordLogin: 'Password Login',
    registerAccount: 'Register Account',
    password: 'Password',
    passwordHint: 'At least 8 characters',
    loginButton: 'Sign In',
    registerButton: 'Register & Sign In',
    devRole: 'Role',
    devEmail: 'Email',
    devName: 'Name',
    logout: 'Sign Out',
    noPermission: 'Current account has no permission for this action',
  },
} as const;

const defaultDraft = {
  shipperId: 'shipper-1',
  carrierId: 'carrier-1',
  vehicleId: 'vehicle-1',
  mileageKm: 380,
  weightKg: 8200,
  volumeM3: 24,
  goodsName: '空调配件 / AC parts',
  extraLoadingFee: 60,
  subsidy: 100,
  deduction: 20,
};

const emptyPartyDraft: Omit<PartyProfile, 'id'> = {
  code: '',
  name: '',
  contactName: '',
  phone: '',
};

function buildDefaultRoadPermitExpiry(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

const emptyVehicleDraft: Omit<VehicleProfile, 'id'> = {
  plateNumber: '',
  truckType: '9.6M',
  maxWeightKg: 0,
  maxVolumeM3: 0,
  roadPermitExpiry: buildDefaultRoadPermitExpiry(),
  assignedDriverId: 'driver-1',
};

const emptyDriverDraft: Omit<DriverProfile, 'id'> = {
  name: '',
  phone: '',
  licenseNumber: '',
  licenseExpiry: '',
};

type PricingRuleDraft = Omit<PricingRule, 'minMileageKm' | 'maxMileageKm' | 'unitPricePerKm' | 'loadingFee' | 'insuranceRate'> & {
  minMileageKm: string;
  maxMileageKm: string;
  unitPricePerKm: string;
  loadingFee: string;
  insuranceRate: string;
};

type SettlementAdjustmentRuleDraft = Omit<SettlementAdjustmentRule, 'value'> & {
  value: string;
};

const emptySettlementAdjustmentDraft: SettlementAdjustmentRuleDraft = {
  code: '',
  label: '',
  category: 'LOADING',
  mode: 'FIXED',
  value: '0',
  enabled: true,
};

const emptyPricingRuleDraft: PricingRuleDraft = {
  shipperId: 'shipper-1',
  truckType: '9.6M',
  minMileageKm: '0',
  maxMileageKm: '300',
  unitPricePerKm: '0',
  loadingFee: '0',
  insuranceRate: '0',
};

function buildNextPricingRuleDraft(
  rules: PricingRule[],
  options?: { shipperId?: string; truckType?: PricingRule['truckType']; fallbackShipperId?: string },
): PricingRuleDraft {
  const shipperId = options?.shipperId ?? options?.fallbackShipperId ?? rules[0]?.shipperId ?? emptyPricingRuleDraft.shipperId;
  const truckType =
    options?.truckType ??
    rules.find((rule) => rule.shipperId === shipperId)?.truckType ??
    emptyPricingRuleDraft.truckType;

  const scopedRules = rules
    .filter((rule) => rule.shipperId === shipperId && rule.truckType === truckType)
    .sort((left, right) => left.maxMileageKm - right.maxMileageKm);

  const lastRule = scopedRules.at(-1);
  if (!lastRule) {
    return {
      ...emptyPricingRuleDraft,
      shipperId,
      truckType,
    };
  }

  return {
    shipperId,
    truckType,
    minMileageKm: String(lastRule.maxMileageKm + 1),
    maxMileageKm: String(lastRule.maxMileageKm + 300),
    unitPricePerKm: String(lastRule.unitPricePerKm),
    loadingFee: String(lastRule.loadingFee),
    insuranceRate: String(lastRule.insuranceRate),
  };
}

function toPricingRuleDraft(rule: PricingRule): PricingRuleDraft {
  return {
    ...rule,
    minMileageKm: String(rule.minMileageKm),
    maxMileageKm: String(rule.maxMileageKm),
    unitPricePerKm: String(rule.unitPricePerKm),
    loadingFee: String(rule.loadingFee),
    insuranceRate: String(rule.insuranceRate),
  };
}

function toSettlementAdjustmentDraft(rule: SettlementAdjustmentRule): SettlementAdjustmentRuleDraft {
  return {
    ...rule,
    value: String(rule.value),
  };
}

function parseDraftNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return parsed;
}

function toPricingRulePayload(rule: PricingRuleDraft): PricingRule {
  return {
    ...rule,
    minMileageKm: parseDraftNumber(rule.minMileageKm, 'minMileageKm'),
    maxMileageKm: parseDraftNumber(rule.maxMileageKm, 'maxMileageKm'),
    unitPricePerKm: parseDraftNumber(rule.unitPricePerKm, 'unitPricePerKm'),
    loadingFee: parseDraftNumber(rule.loadingFee, 'loadingFee'),
    insuranceRate: parseDraftNumber(rule.insuranceRate, 'insuranceRate'),
  };
}

function toSettlementAdjustmentPayload(rule: SettlementAdjustmentRuleDraft): SettlementAdjustmentRule {
  return {
    ...rule,
    value: parseDraftNumber(rule.value, 'value'),
  };
}

function money(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(value);
}

function createIdempotencyKey(): string {
  const maybeCrypto = globalThis.crypto;
  if (maybeCrypto?.randomUUID) {
    return maybeCrypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isAlertWarningStatus(status?: DocumentWarning['status']): boolean {
  return status === 'EXPIRED' || status === 'EXPIRING_SOON';
}

function formatWarningStatusText(
  warning: DocumentWarning | undefined,
  t: (typeof I18N)[keyof typeof I18N],
  translateStatus: (status: string) => string,
): string {
  if (!warning) {
    return t.normal;
  }

  if (warning.status === 'INVALID') {
    return t.invalidDate;
  }

  if (warning.daysRemaining !== null) {
    return `${translateStatus(warning.status)} (${warning.daysRemaining} ${t.remainDays})`;
  }

  return translateStatus(warning.status);
}

async function parseCsvFile(file: File): Promise<WaybillImportRow[]> {
  const content = await file.text();
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) {
    return [];
  }

  const rows: WaybillImportRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split(',');
    if (parts.length < 10) {
      continue;
    }
    rows.push({
      shipperId: parts[0],
      carrierId: parts[1],
      vehicleId: parts[2],
      mileageKm: Number(parts[3]),
      weightKg: Number(parts[4]),
      volumeM3: Number(parts[5]),
      goodsName: parts[6],
      extraLoadingFee: Number(parts[7]),
      subsidy: Number(parts[8]),
      deduction: Number(parts[9]),
      idempotencyKey: parts[10],
    });
  }

  return rows;
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
    return saved === 'en-US' ? 'en-US' : 'zh-CN';
  });
  const [active, setActive] = useState<NavKey>('overview');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(true);
  const [googleUiState, setGoogleUiState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [googleRetrySeed, setGoogleRetrySeed] = useState(0);
  const [devLoginForm, setDevLoginForm] = useState({
    email: 'admin@example.com',
    password: '123456',
    role: 'ADMIN' as AuthUser['role'],
  });
  const [passwordLoginForm, setPasswordLoginForm] = useState({
    email: '1806909748@qq.com',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState({
    email: '',
    name: '',
    role: 'SHIPPER' as Extract<AuthUser['role'], 'SHIPPER' | 'CARRIER'>,
    password: '',
  });
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [waybills, setWaybills] = useState<WaybillRecord[]>([]);
  const [warnings, setWarnings] = useState<DocumentWarning[]>([]);
  const [warningFilter, setWarningFilter] = useState<WarningFilter>('ALL');
  const [draft, setDraft] = useState(defaultDraft);
  const [submitMessage, setSubmitMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [archiveTab, setArchiveTab] = useState<ArchiveTab>('shippers');
  const [archiveMessage, setArchiveMessage] = useState('');
  const [editingShipperId, setEditingShipperId] = useState<string | null>(null);
  const [editingCarrierId, setEditingCarrierId] = useState<string | null>(null);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [shipperDraft, setShipperDraft] = useState<Omit<PartyProfile, 'id'>>(emptyPartyDraft);
  const [carrierDraft, setCarrierDraft] = useState<Omit<PartyProfile, 'id'>>(emptyPartyDraft);
  const [vehicleDraft, setVehicleDraft] = useState<Omit<VehicleProfile, 'id'>>(emptyVehicleDraft);
  const [driverDraft, setDriverDraft] = useState<Omit<DriverProfile, 'id'>>(emptyDriverDraft);
  const [actionMessage, setActionMessage] = useState('');
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [cacheScenarios, setCacheScenarios] = useState<CacheScenarioPayload | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importChunkSize, setImportChunkSize] = useState(800);
  const [importBusy, setImportBusy] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, created: 0, failed: 0 });
  const [waybillPage, setWaybillPage] = useState(1);
  const [settlementMessage, setSettlementMessage] = useState('');
  const [pricingRuleDrafts, setPricingRuleDrafts] = useState<PricingRuleDraft[]>([]);
  const [pricingRuleCreateDraft, setPricingRuleCreateDraft] = useState<PricingRuleDraft>(emptyPricingRuleDraft);
  const [settlementAdjustmentDrafts, setSettlementAdjustmentDrafts] = useState<SettlementAdjustmentRuleDraft[]>([]);
  const [settlementAdjustmentDraft, setSettlementAdjustmentDraft] = useState<SettlementAdjustmentRuleDraft>(emptySettlementAdjustmentDraft);
  const [importReport, setImportReport] = useState<{
    durationSec: number;
    storage: string;
    peakHeapAfterMB: number;
    chunkCount: number;
    importBatchId: string;
  } | null>(null);

  const t = I18N[locale];
  const permissionSet = new Set(authUser?.permissions ?? []);

  function can(permission: string): boolean {
    return permissionSet.has(permission);
  }

  function isUnauthorizedErrorMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('unauthorized') || normalized.includes('please login first');
  }

  function resetToLogin(message: string) {
    setAuthToken(null);
    setAuthUser(null);
    setBootstrap(null);
    setDashboard(null);
    setWaybills([]);
    setWarnings([]);
    setCacheScenarios(null);
    setLoadError('');
    setAuthMessage(message);
    setLoading(false);
  }

  const navItems = useMemo(
    () => [
      { key: 'overview' as NavKey, label: t.navOverview, visible: can('dashboard:view') },
      { key: 'waybills' as NavKey, label: t.navWaybills, visible: can('waybill:view') },
      { key: 'import' as NavKey, label: t.navImport, visible: can('waybill:create') },
      { key: 'warnings' as NavKey, label: t.navWarnings, visible: can('master:manage') },
      { key: 'archives' as NavKey, label: t.navArchives, visible: can('master:manage') },
      { key: 'settlement' as NavKey, label: t.navSettlement, visible: can('settlement:view') },
      { key: 'architecture' as NavKey, label: t.navArchitecture, visible: can('report:view') },
    ].filter((item) => item.visible),
    [t, permissionSet],
  );

  useEffect(() => {
    if (navItems.length === 0) {
      return;
    }
    if (!navItems.some((item) => item.key === active)) {
      setActive(navItems[0].key);
    }
  }, [active, navItems]);

  useEffect(() => {
    globalThis.localStorage?.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapAuth() {
      setAuthLoading(true);
      setAuthMessage('');
      try {
        const config = await fetchAuthConfig();
        if (cancelled) {
          return;
        }
        setAuthConfig(config);

        try {
          const me = await fetchAuthMe();
          if (!cancelled) {
            setAuthUser(me.user);
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'auth init failed';
            setAuthToken(null);
            setAuthUser(null);
            if (!isUnauthorizedErrorMessage(message)) {
              setAuthMessage(message);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAuthMessage(error instanceof Error ? error.message : 'auth init failed');
        }
      } finally {
        if (!cancelled) {
          setAuthLoading(false);
        }
      }
    }

    void bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authConfig?.googleEnabled || !authConfig.googleClientId || authUser) {
      setGoogleUiState('idle');
      return;
    }
    setGoogleUiState('loading');
    const googleClientId = authConfig.googleClientId;

    const scriptId = 'google-identity-service';
    const renderGoogleButton = (): boolean => {
      const host = document.getElementById('google-login-btn');
      if (!host || !window.google?.accounts?.id) {
        return false;
      }

      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response) => {
          try {
            const result = await loginWithGoogle(response.credential);
            setAuthToken(result.token);
            setAuthUser(result.user);
            setAuthMessage('');
          } catch (error) {
            setAuthMessage(error instanceof Error ? error.message : 'google login failed');
          }
        },
      });

      host.innerHTML = '';
      window.google.accounts.id.renderButton(host, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        text: 'signin_with',
      });
      setGoogleUiState('ready');
      return true;
    };

    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existing && !window.google?.accounts?.id) {
      existing.remove();
    }

    if (window.google?.accounts?.id) {
      if (!renderGoogleButton()) {
        setGoogleUiState('error');
      }
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!renderGoogleButton()) {
        setGoogleUiState('error');
      }
    };
    script.onerror = () => setGoogleUiState('error');
    document.head.appendChild(script);

    const timer = window.setTimeout(() => {
      const host = document.getElementById('google-login-btn');
      if (!host?.childElementCount) {
        setGoogleUiState('error');
      }
    }, 6000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [authConfig, authUser, googleRetrySeed]);

  async function handleDevLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await devLogin(devLoginForm);
      setAuthToken(result.token);
      setAuthUser(result.user);
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'dev login failed');
    }
  }

  async function handlePasswordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await loginWithPassword(passwordLoginForm);
      setAuthToken(result.token);
      setAuthUser(result.user);
      setAuthMessage('');
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'password login failed');
    }
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await registerWithPassword(registerForm);
      setAuthToken(result.token);
      setAuthUser(result.user);
      setAuthMessage('');
      setRegisterForm({
        email: '',
        name: '',
        role: 'SHIPPER',
        password: '',
      });
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : 'register failed');
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setAuthToken(null);
      setAuthUser(null);
      setBootstrap(null);
      setDashboard(null);
      setWaybills([]);
      setWarnings([]);
    }
  }

  function translateStatus(status: string): string {
    if (locale === 'en-US') {
      return status;
    }

    const map: Record<string, string> = {
      DRAFT: '草稿',
      ASSIGNED: '已分配',
      PICKED_UP: '已提货',
      IN_TRANSIT: '运输中',
      SIGNED: '已签收',
      POD_UPLOADED: '回单已上传',
      EXPIRED: '已过期',
      EXPIRING_SOON: '即将过期',
      INVALID: '无效',
    };

    return map[status] ?? status;
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!authUser) {
        setLoading(false);
        return;
      }
      try {
        setLoadError('');
        setLoading(true);
        const [bootstrapData, dashboardData, waybillData, warningData, pricingData, adjustmentData, cacheScenarioData] = await Promise.all([
          fetchBootstrap(),
          fetchDashboard(),
          can('waybill:view') ? fetchWaybills() : Promise.resolve({ items: [], storage: 'memory' }),
          can('master:manage') ? fetchWarnings() : Promise.resolve({ items: [] }),
          can('settlement:view') ? fetchPricingRules() : Promise.resolve({ items: [] }),
          can('settlement:view') ? fetchSettlementAdjustmentRules() : Promise.resolve({ items: [] }),
          can('report:view') ? fetchCacheScenarios() : Promise.resolve(null),
        ]);
        if (!cancelled) {
          setBootstrap(bootstrapData);
          setDashboard(dashboardData);
          setWaybills(waybillData.items);
          setWarnings(warningData.items);
          setPricingRuleDrafts(pricingData.items.map((rule) => toPricingRuleDraft(rule)));
          setPricingRuleCreateDraft(
            buildNextPricingRuleDraft(pricingData.items, {
              fallbackShipperId: bootstrapData.references.shippers[0]?.id,
            }),
          );
          setSettlementAdjustmentDrafts(adjustmentData.items.map((rule) => toSettlementAdjustmentDraft(rule)));
          setCacheScenarios(cacheScenarioData);
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'unknown error';
          if (isUnauthorizedErrorMessage(message)) {
            resetToLogin(message);
            return;
          }
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  const warningRows = useMemo(() => {
    if (!bootstrap) {
      return [];
    }

    const vehicleWarningMap = new Map(
      warnings.filter((item) => item.entityType === 'VEHICLE').map((item) => [item.entityId, item]),
    );
    const driverWarningMap = new Map(
      warnings.filter((item) => item.entityType === 'DRIVER').map((item) => [item.entityId, item]),
    );

    return bootstrap.references.vehicles.map((vehicle) => {
      const driver = bootstrap.references.drivers.find((item) => item.id === vehicle.assignedDriverId);
      const vehicleWarning = vehicleWarningMap.get(vehicle.id);
      const driverWarning = driver ? driverWarningMap.get(driver.id) : undefined;
      return {
        ...vehicle,
        vehicleWarning,
        driverWarning,
        driver,
      };
    });
  }, [bootstrap, warnings]);

  const waybillPageCount = Math.max(1, Math.ceil(waybills.length / WAYBILL_PAGE_SIZE));
  const pagedWaybills = useMemo(() => {
    const start = (waybillPage - 1) * WAYBILL_PAGE_SIZE;
    return waybills.slice(start, start + WAYBILL_PAGE_SIZE);
  }, [waybillPage, waybills]);
  const waybillPageSummary = t.waybillPageSummary
    .replace('{current}', String(waybillPage))
    .replace('{total}', String(waybillPageCount))
    .replace('{size}', String(WAYBILL_PAGE_SIZE));

  useEffect(() => {
    setWaybillPage((current) => Math.min(current, waybillPageCount));
  }, [waybillPageCount]);

  async function reloadReferences() {
    const [bootstrapData, warningData, pricingData, adjustmentData, cacheScenarioData] = await Promise.all([
      fetchBootstrap(),
      can('master:manage') ? fetchWarnings() : Promise.resolve({ items: [] }),
      can('settlement:view') ? fetchPricingRules() : Promise.resolve({ items: [] }),
      can('settlement:view') ? fetchSettlementAdjustmentRules() : Promise.resolve({ items: [] }),
      can('report:view') ? fetchCacheScenarios() : Promise.resolve(null),
    ]);
    setBootstrap(bootstrapData);
    setWarnings(warningData.items);
    setPricingRuleDrafts(pricingData.items.map((rule) => toPricingRuleDraft(rule)));
    setPricingRuleCreateDraft(
      buildNextPricingRuleDraft(pricingData.items, {
        fallbackShipperId: bootstrapData.references.shippers[0]?.id,
      }),
    );
    setSettlementAdjustmentDrafts(adjustmentData.items.map((rule) => toSettlementAdjustmentDraft(rule)));
    setCacheScenarios(cacheScenarioData);
  }

  async function handleSavePricingRule(rule: PricingRuleDraft) {
    if (!can('master:manage')) {
      setSettlementMessage(t.noPermission);
      return;
    }

    try {
      await savePricingRule(toPricingRulePayload(rule));
      await reloadReferences();
      setSettlementMessage(t.saveSuccess);
    } catch (error) {
      setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleCreatePricingRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('master:manage')) {
      setSettlementMessage(t.noPermission);
      return;
    }

    try {
      await savePricingRule(toPricingRulePayload(pricingRuleCreateDraft));
      await reloadReferences();
      setSettlementMessage(t.saveSuccess);
    } catch (error) {
      setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleDeletePricingRule(index: number) {
    if (!can('master:manage')) {
      setSettlementMessage(t.noPermission);
      return;
    }

    const confirmed = globalThis.confirm(locale === 'en-US' ? 'Confirm delete this pricing rule?' : '确认删除该定价规则吗？');
    if (!confirmed) {
      return;
    }

    try {
      const rule = pricingRuleDrafts[index];
      await deletePricingRule(rule?.id, index);
      await reloadReferences();
      setSettlementMessage(t.saveSuccess);
    } catch (error) {
      setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleSaveSettlementAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('master:manage')) {
      setSettlementMessage(t.noPermission);
      return;
    }

    try {
      await saveSettlementAdjustmentRule(toSettlementAdjustmentPayload(settlementAdjustmentDraft));
      await reloadReferences();
      setSettlementAdjustmentDraft(emptySettlementAdjustmentDraft);
      setSettlementMessage(t.saveSuccess);
    } catch (error) {
      setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleSaveSettlementAdjustmentRow(rule: SettlementAdjustmentRuleDraft) {
    if (!can('master:manage')) {
      setSettlementMessage(t.noPermission);
      return;
    }

    try {
      await saveSettlementAdjustmentRule(toSettlementAdjustmentPayload(rule));
      await reloadReferences();
      setSettlementMessage(t.saveSuccess);
    } catch (error) {
      setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleDeleteSettlementAdjustment(index: number) {
    if (!can('master:manage')) {
      setSettlementMessage(t.noPermission);
      return;
    }

    const confirmed = globalThis.confirm(locale === 'en-US' ? 'Confirm delete this adjustment rule?' : '确认删除该调整规则吗？');
    if (!confirmed) {
      return;
    }

    try {
      const rule = settlementAdjustmentDrafts[index];
      await deleteSettlementAdjustmentRule(rule?.id, index);
      await reloadReferences();
      setSettlementMessage(t.saveSuccess);
    } catch (error) {
      setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  function resetArchiveDrafts() {
    setEditingShipperId(null);
    setEditingCarrierId(null);
    setEditingVehicleId(null);
    setEditingDriverId(null);
    setShipperDraft(emptyPartyDraft);
    setCarrierDraft(emptyPartyDraft);
    setVehicleDraft({
      ...emptyVehicleDraft,
      assignedDriverId: bootstrap?.references.drivers[0]?.id ?? emptyVehicleDraft.assignedDriverId,
    });
    setDriverDraft(emptyDriverDraft);
  }

  async function handleSaveShipper(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('master:manage')) {
      setArchiveMessage(t.noPermission);
      return;
    }
    try {
      if (editingShipperId) {
        await updateShipper(editingShipperId, shipperDraft);
      } else {
        await createShipper(shipperDraft);
      }
      await reloadReferences();
      resetArchiveDrafts();
      setArchiveMessage(t.saveSuccess);
    } catch (error) {
      setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleSaveCarrier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('master:manage')) {
      setArchiveMessage(t.noPermission);
      return;
    }
    try {
      if (editingCarrierId) {
        await updateCarrier(editingCarrierId, carrierDraft);
      } else {
        await createCarrier(carrierDraft);
      }
      await reloadReferences();
      resetArchiveDrafts();
      setArchiveMessage(t.saveSuccess);
    } catch (error) {
      setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleSaveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('master:manage')) {
      setArchiveMessage(t.noPermission);
      return;
    }

    const normalizedPlateNumber = vehicleDraft.plateNumber.trim();
    const normalizedRoadPermitExpiry = vehicleDraft.roadPermitExpiry.trim();
    if (!normalizedPlateNumber) {
      setArchiveMessage(locale === 'en-US' ? 'Please enter plate number before saving.' : '请先填写车牌号后再保存。');
      return;
    }
    if (!normalizedRoadPermitExpiry) {
      setArchiveMessage(locale === 'en-US' ? 'Please select road permit expiry before saving.' : '请先填写道路运输证到期日后再保存。');
      return;
    }

    try {
      const payload = {
        ...vehicleDraft,
        plateNumber: normalizedPlateNumber,
        roadPermitExpiry: normalizedRoadPermitExpiry,
        maxWeightKg: Number(vehicleDraft.maxWeightKg),
        maxVolumeM3: Number(vehicleDraft.maxVolumeM3),
      };

      if (editingVehicleId) {
        await updateVehicle(editingVehicleId, payload);
      } else {
        await createVehicle(payload);
      }
      await reloadReferences();
      resetArchiveDrafts();
      setArchiveMessage(t.saveSuccess);
    } catch (error) {
      setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleSaveDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('master:manage')) {
      setArchiveMessage(t.noPermission);
      return;
    }
    try {
      if (editingDriverId) {
        await updateDriver(editingDriverId, driverDraft);
      } else {
        await createDriver(driverDraft);
      }
      await reloadReferences();
      resetArchiveDrafts();
      setArchiveMessage(t.saveSuccess);
    } catch (error) {
      setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleDelete(type: 'shipper' | 'carrier' | 'vehicle' | 'driver', id: string) {
    if (!can('master:manage')) {
      setArchiveMessage(t.noPermission);
      return;
    }
    const confirmed = globalThis.confirm(locale === 'en-US' ? 'Confirm delete?' : '确认删除该档案吗？');
    if (!confirmed) {
      return;
    }

    try {
      if (type === 'shipper') {
        await deleteShipper(id);
      } else if (type === 'carrier') {
        await deleteCarrier(id);
      } else if (type === 'vehicle') {
        await deleteVehicle(id);
      } else {
        await deleteDriver(id);
      }
      await reloadReferences();
      resetArchiveDrafts();
      setArchiveMessage(t.saveSuccess);
    } catch (error) {
      setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  async function handleCreateWaybill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!can('waybill:create')) {
      setSubmitMessage(t.noPermission);
      return;
    }

    if (!bootstrap) {
      setSubmitMessage(t.initNotReady);
      return;
    }

    const shipperExists = bootstrap.references.shippers.some((item) => item.id === draft.shipperId);
    if (!shipperExists) {
      setSubmitMessage(t.shipperMissing);
      return;
    }

    const carrierExists = bootstrap.references.carriers.some((item) => item.id === draft.carrierId);
    if (!carrierExists) {
      setSubmitMessage(t.carrierMissing);
      return;
    }

    const vehicle = bootstrap.references.vehicles.find((item) => item.id === draft.vehicleId);
    if (!vehicle) {
      setSubmitMessage(t.vehicleMissing);
      return;
    }

    const mileage = Number(draft.mileageKm);
    const matchedRule = bootstrap.references.pricingRules.find(
      (rule) =>
        rule.shipperId === draft.shipperId &&
        rule.truckType === vehicle.truckType &&
        mileage >= rule.minMileageKm &&
        mileage <= rule.maxMileageKm,
    );

    if (!matchedRule) {
      setSubmitMessage(t.pricingMissing);
      return;
    }

    try {
      const result = await createWaybill({
        ...draft,
        mileageKm: mileage,
        weightKg: Number(draft.weightKg),
        volumeM3: Number(draft.volumeM3),
        extraLoadingFee: Number(draft.extraLoadingFee),
        subsidy: Number(draft.subsidy),
        deduction: Number(draft.deduction),
      });

      if ('splitApplied' in result && result.splitApplied) {
        setWaybills((current) => [...result.items, ...current]);
        setSubmitMessage(
          `${t.splitAppliedHint}: ${result.splitCount}，overweight=${result.overweightKg}kg，overVolume=${result.overVolumeM3}m3`,
        );
      } else {
        const createdRecord = result as WaybillRecord;
        setWaybills((current) => [createdRecord, ...current]);
        setSubmitMessage(
          `${t.createdOk} ${createdRecord.waybillNo}，${t.totalAmountLabel} ${money(createdRecord.totalAmount, locale)}`,
        );
      }
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : t.createFailed);
    }
  }

  async function handleQuoteWaybill() {
    if (!bootstrap) {
      setSubmitMessage(t.initNotReady);
      return;
    }

    try {
      const result = await quoteWaybill({
        ...draft,
        mileageKm: Number(draft.mileageKm),
        weightKg: Number(draft.weightKg),
        volumeM3: Number(draft.volumeM3),
        extraLoadingFee: Number(draft.extraLoadingFee),
        subsidy: Number(draft.subsidy),
        deduction: Number(draft.deduction),
      });

      const capacityPart = result.capacity.valid
        ? 'capacity=OK'
        : `capacity=EXCEEDED split=${result.capacity.suggestedSplitCount} overweight=${result.capacity.overweightKg}kg overVolume=${result.capacity.overVolumeM3}m3`;
      setSubmitMessage(
        `${capacityPart} | quote=${money(result.fee.totalAmount, locale)} | shard=${result.fee.shardTable}`,
      );
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : t.createFailed);
    }
  }

  function unwrapTransitionRecord(result: WaybillTransitionResponse): WaybillRecord {
    if ('idempotentBlocked' in result) {
      return result.data;
    }
    return result;
  }

  function upsertWaybillRecord(record: WaybillRecord) {
    setWaybills((current) => {
      const index = current.findIndex((item) => item.id === record.id);
      if (index < 0) {
        return [record, ...current];
      }
      const next = [...current];
      next[index] = record;
      return next;
    });
  }

  async function handleSign(item: WaybillRecord) {
    if (!can('waybill:transition')) {
      setActionMessage(t.noPermission);
      return;
    }
    setActionBusyId(`${item.id}:sign`);
    try {
      const result = await signWaybill(item.id);
      const record = unwrapTransitionRecord(result);
      upsertWaybillRecord(record);
      if ('idempotentBlocked' in result) {
        setActionMessage(result.message);
      } else {
        setActionMessage(`${t.actionSign} success: ${record.waybillNo}`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handlePickup(item: WaybillRecord) {
    if (!can('waybill:transition')) {
      setActionMessage(t.noPermission);
      return;
    }
    setActionBusyId(`${item.id}:pickup`);
    try {
      const result = await pickupWaybill(item.id);
      const record = unwrapTransitionRecord(result);
      upsertWaybillRecord(record);
      if ('idempotentBlocked' in result) {
        setActionMessage(result.message);
      } else {
        setActionMessage(`${t.actionPickup} success: ${record.waybillNo}`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleStartTransit(item: WaybillRecord) {
    if (!can('waybill:transition')) {
      setActionMessage(t.noPermission);
      return;
    }
    setActionBusyId(`${item.id}:start-transit`);
    try {
      const result = await startTransitWaybill(item.id);
      const record = unwrapTransitionRecord(result);
      upsertWaybillRecord(record);
      if ('idempotentBlocked' in result) {
        setActionMessage(result.message);
      } else {
        setActionMessage(`${t.actionStartTransit} success: ${record.waybillNo}`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleUploadPod(item: WaybillRecord) {
    if (!can('pod:upload')) {
      setActionMessage(t.noPermission);
      return;
    }
    setActionBusyId(`${item.id}:pod`);
    try {
      const result = await uploadPod(item.id);
      const record = unwrapTransitionRecord(result);
      upsertWaybillRecord(record);
      if ('idempotentBlocked' in result) {
        setActionMessage(result.message);
      } else {
        setActionMessage(`${t.actionUploadPod} success: ${record.waybillNo}`);
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDuplicateSignTest(item: WaybillRecord) {
    if (!can('waybill:transition')) {
      setActionMessage(t.noPermission);
      return;
    }
    setActionBusyId(`${item.id}:dup-sign`);
    try {
      const idemKey = createIdempotencyKey();
      await signWaybill(item.id, { idempotencyKey: idemKey });
      const second = await signWaybill(item.id, { idempotencyKey: idemKey });
      const record = unwrapTransitionRecord(second);
      upsertWaybillRecord(record);
      if ('idempotentBlocked' in second) {
        setActionMessage(`OK: ${second.message}`);
      } else {
        setActionMessage('Duplicate sign was not blocked.');
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDuplicatePodTest(item: WaybillRecord) {
    if (!can('pod:upload')) {
      setActionMessage(t.noPermission);
      return;
    }
    setActionBusyId(`${item.id}:dup-pod`);
    try {
      const idemKey = createIdempotencyKey();
      await uploadPod(item.id, { idempotencyKey: idemKey });
      const second = await uploadPod(item.id, { idempotencyKey: idemKey });
      const record = unwrapTransitionRecord(second);
      upsertWaybillRecord(record);
      if ('idempotentBlocked' in second) {
        setActionMessage(`OK: ${second.message}`);
      } else {
        setActionMessage('Duplicate upload-pod was not blocked.');
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleImport10k() {
    if (!importFile) {
      setActionMessage(t.importSelectFileFirst);
      return;
    }

    setImportBusy(true);
    setImportReport(null);
    setActionMessage(t.importBusy);

    const startedAt = performance.now();
    const batchId = `web-import-${Date.now()}`;
    let created = 0;
    let failed = 0;
    let peakHeapAfterMB = 0;
    let chunkCount = 0;
    let storage = 'unknown';

    try {
      const rows = await parseCsvFile(importFile);
      const chunks = chunkRows(rows, Math.max(50, Math.min(1000, importChunkSize)));
      setImportProgress({ done: 0, total: rows.length, created: 0, failed: 0 });

      for (const chunk of chunks) {
        chunkCount += 1;
        const result: WaybillImportChunkResult = await importWaybillChunk({
          importBatchId: batchId,
          rows: chunk,
        });

        created += result.created;
        failed += result.failed;
        storage = result.storage;
        peakHeapAfterMB = Math.max(peakHeapAfterMB, result.heapAfterMB);
        setImportProgress({
          done: created + failed,
          total: rows.length,
          created,
          failed,
        });
      }

      const durationSec = Math.round(((performance.now() - startedAt) / 1000) * 100) / 100;
      setImportReport({
        durationSec,
        storage,
        peakHeapAfterMB,
        chunkCount,
        importBatchId: batchId,
      });
      setActionMessage(`${t.importDone}: ${created}/${created + failed}`);
      const [dashboardData, waybillData] = await Promise.all([fetchDashboard(), fetchWaybills()]);
      setDashboard(dashboardData);
      setWaybills(waybillData.items);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : t.createFailed);
    } finally {
      setImportBusy(false);
    }
  }

  function renderImportSection() {
    if (!can('waybill:create')) {
      return null;
    }

    return (
      <section className="card">
        <div className="section-head">
          <h3>{t.importTitle}</h3>
          <span>{t.importHint}</span>
        </div>

        <div className="form-grid">
          <label>
            <span>{t.importPickFile}</span>
            <input
              type="file"
              accept=".csv"
              onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              disabled={importBusy}
            />
          </label>
          <label>
            <span>{t.importChunkSize}</span>
            <input
              type="number"
              min={50}
              max={1000}
              value={importChunkSize}
              onChange={(event) => setImportChunkSize(Number(event.target.value) || 800)}
              disabled={importBusy}
            />
          </label>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleImport10k()}
            disabled={importBusy || !can('waybill:create')}
          >
            {t.importStart}
          </button>
        </div>

        <div className="import-progress-row">
          <strong>{t.importProgress}</strong>
          <span>{importProgress.done}/{importProgress.total}</span>
          <span>{t.importCreated}: {importProgress.created}</span>
          <span>{t.importFailed}: {importProgress.failed}</span>
        </div>

        {importReport ? (
          <div className="import-report-grid">
            <article>
              <strong>{t.importDuration}</strong>
              <p>{importReport.durationSec}s</p>
            </article>
            <article>
              <strong>{t.importStorage}</strong>
              <p>{importReport.storage}</p>
            </article>
            <article>
              <strong>{t.importPeakHeap}</strong>
              <p>{importReport.peakHeapAfterMB}</p>
            </article>
            <article>
              <strong>Batch</strong>
              <p>{importReport.importBatchId} / chunks={importReport.chunkCount}</p>
            </article>
          </div>
        ) : null}
      </section>
    );
  }

  if (authLoading) {
    return <div className="loading-shell">{t.loading}</div>;
  }

  if (!authUser) {
    return (
      <div className="loading-shell">
        <div className="card" style={{ maxWidth: 560, width: '100%', textAlign: 'left' }}>
          <div className="section-head">
            <h3>{t.loginTitle}</h3>
            <span>{t.loginHint}</span>
          </div>
          <div className="filter-row" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={locale === 'zh-CN' ? 'filter-button active' : 'filter-button'}
              onClick={() => setLocale('zh-CN')}
            >
              中文
            </button>
            <button
              type="button"
              className={locale === 'en-US' ? 'filter-button active' : 'filter-button'}
              onClick={() => setLocale('en-US')}
            >
              EN
            </button>
          </div>

          {authConfig?.googleEnabled ? (
            <>
              <p>{t.loginByGoogle}</p>
              <div id="google-login-btn" />
              {googleUiState === 'loading' ? <p>{t.googleLoading}</p> : null}
              {googleUiState === 'error' ? (
                <>
                  <p className="submit-message">{t.googleUnavailable}</p>
                  <button className="filter-button" type="button" onClick={() => setGoogleRetrySeed((value) => value + 1)}>
                    {t.googleRetry}
                  </button>
                </>
              ) : null}
            </>
          ) : (
            <p>{t.googleNotConfigured}</p>
          )}

          {authConfig?.devLoginEnabled ? (
            <div className="panel-stack">
              <h4>{t.passwordLogin}</h4>
              <form className="form-grid" onSubmit={handlePasswordLogin}>
                <label>
                  <span>{t.devEmail}</span>
                  <input
                    value={passwordLoginForm.email}
                    onChange={(event) => setPasswordLoginForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t.password}</span>
                  <input
                    type="password"
                    value={passwordLoginForm.password}
                    onChange={(event) =>
                      setPasswordLoginForm((current) => ({ ...current, password: event.target.value }))
                    }
                  />
                </label>
                <button className="primary-button" type="submit">{t.loginButton}</button>
              </form>

              <h4>{t.registerAccount}</h4>
              <form className="form-grid" onSubmit={handleRegister}>
                <label>
                  <span>{t.devEmail}</span>
                  <input
                    value={registerForm.email}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t.devName}</span>
                  <input
                    value={registerForm.name}
                    onChange={(event) => setRegisterForm((current) => ({ ...current, name: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t.devRole}</span>
                  <select
                    value={registerForm.role}
                    onChange={(event) =>
                      setRegisterForm((current) => ({
                        ...current,
                        role: event.target.value as Extract<AuthUser['role'], 'SHIPPER' | 'CARRIER'>,
                      }))
                    }
                  >
                    <option value="SHIPPER">SHIPPER</option>
                    <option value="CARRIER">CARRIER</option>
                  </select>
                </label>
                <label>
                  <span>{t.password}</span>
                  <input
                    type="password"
                    placeholder={t.passwordHint}
                    value={registerForm.password}
                    onChange={(event) =>
                      setRegisterForm((current) => ({ ...current, password: event.target.value }))
                    }
                  />
                </label>
                <button className="primary-button" type="submit">{t.registerButton}</button>
              </form>

              <h4>{t.devLogin}</h4>
              <form className="form-grid" onSubmit={handleDevLogin}>
                <label>
                  <span>{t.devEmail}</span>
                  <input
                    value={devLoginForm.email}
                    onChange={(event) => setDevLoginForm((current) => ({ ...current, email: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t.password}</span>
                  <input
                    type="password"
                    placeholder={t.passwordHint}
                    value={devLoginForm.password}
                    onChange={(event) => setDevLoginForm((current) => ({ ...current, password: event.target.value }))}
                  />
                </label>
                <label>
                  <span>{t.devRole}</span>
                  <select
                    value={devLoginForm.role}
                    onChange={(event) =>
                      setDevLoginForm((current) => ({ ...current, role: event.target.value as AuthUser['role'] }))
                    }
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="SHIPPER">SHIPPER</option>
                    <option value="CARRIER">CARRIER</option>
                  </select>
                </label>
                <button className="filter-button" type="submit">{t.devLogin}</button>
              </form>
            </div>
          ) : null}

          {authMessage ? <p className="submit-message">{authMessage}</p> : null}
        </div>
      </div>
    );
  }

  if (loading || !bootstrap || !dashboard) {
    if (!loading && loadError) {
      return (
        <div className="loading-shell">
          <div className="card" style={{ maxWidth: 560, width: '100%', textAlign: 'left' }}>
            <p className="submit-message">{t.loadFailed}{loadError}</p>
            <button
              type="button"
              className="primary-button"
              onClick={() => resetToLogin(loadError)}
            >
              {locale === 'en-US' ? 'Back to login' : '返回登录'}
            </button>
          </div>
        </div>
      );
    }
    return <div className="loading-shell">{t.loading}</div>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">{t.internalSuite}</p>
          <h1>{t.title}</h1>
          <p className="sidebar-copy">{t.subtitle}</p>
        </div>

        <div className="filter-row">
          <span className="eyebrow">{t.language}</span>
          <button
            type="button"
            className={locale === 'zh-CN' ? 'filter-button active' : 'filter-button'}
            onClick={() => setLocale('zh-CN')}
          >
            中文
          </button>
          <button
            type="button"
            className={locale === 'en-US' ? 'filter-button active' : 'filter-button'}
            onClick={() => setLocale('en-US')}
          >
            EN
          </button>
        </div>

        <nav className="nav-list">
          {navItems.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={active === key ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(key)}
            >
              {label}
            </button>
          ))}
        </nav>

        <section className="login-card">
          <span className="chip">Google SSO</span>
          <p>{t.ssoDesc}</p>
          <p>{authUser.name} ({authUser.role})</p>
          <p>{authUser.email}</p>
          <button type="button" className="filter-button" onClick={() => void handleLogout()}>
            {t.logout}
          </button>
          <div className="role-grid">
            {Object.entries(bootstrap.permissions).map(([role, permissions]) => (
              <div key={role} className="role-card">
                <strong>{role}</strong>
                <span>{permissions.length}{t.permissionsSuffix}</span>
              </div>
            ))}
          </div>
          {authMessage ? <p className="submit-message">{authMessage}</p> : null}
        </section>
      </aside>

      <main className="content">
        <header className="hero">
          <div>
            <p className="eyebrow">{t.heroEyebrow}</p>
            <h2>{t.title}</h2>
          </div>
          <div className="hero-badges">
            {bootstrap.system.infra.map((item) => (
              <span key={item} className="badge">{item}</span>
            ))}
          </div>
        </header>

        {active === 'overview' && (
          <section className="panel-stack">
            <div className="metric-grid">
              <article className="metric-card accent-orange">
                <span>{t.metricWaybills}</span>
                <strong>{dashboard.metrics.waybillCount}</strong>
                <p>{t.metricWaybillsDesc}</p>
              </article>
              <article className="metric-card accent-blue">
                <span>{t.metricRevenue}</span>
                <strong>{money(dashboard.metrics.revenue, locale)}</strong>
                <p>{t.metricRevenueDesc}</p>
              </article>
              <article className="metric-card accent-green">
                <span>{t.metricProfit}</span>
                <strong>{money(dashboard.metrics.carrierGrossProfit, locale)}</strong>
                <p>{t.metricProfitDesc}</p>
              </article>
              <article className="metric-card accent-red">
                <span>{t.metricSignRate}</span>
                <strong>{Math.round(dashboard.metrics.onTimeSignRate * 100)}%</strong>
                <p>{t.metricSignRateDesc}</p>
              </article>
            </div>

            <div className="two-column">
              <section className="card">
                <div className="section-head">
                  <h3>{t.recentWaybills}</h3>
                  <span>{t.recentWaybillsSub}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.waybillNo}</th>
                      <th>{t.goods}</th>
                      <th>{t.status}</th>
                      <th>{t.amount}</th>
                      <th>{t.shard}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.waybills.map((item) => (
                      <tr key={item.id}>
                        <td>{item.waybillNo}</td>
                        <td>{item.goodsName}</td>
                        <td>{translateStatus(item.status)}</td>
                        <td>{money(item.totalAmount, locale)}</td>
                        <td>{item.shardTable}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="card">
                <div className="section-head">
                  <h3>{t.warningTitle}</h3>
                  <span>{t.warningSub}</span>
                </div>
                <div className="warning-list">
                  {dashboard.warnings.map((warning) => (
                    <article key={warning.entityId + warning.documentName} className={`warning-item ${warning.status.toLowerCase()}`}>
                      <strong>{warning.entityName}</strong>
                      <span>{warning.documentName}</span>
                      <p>{warning.expiryDate} / {translateStatus(warning.status)}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {active === 'waybills' && (
          <section className="panel-stack">
            <div className="two-column wide-left">
              <section className="card">
                <div className="section-head">
                  <h3>{t.createWaybillTitle}</h3>
                  <span>{t.createWaybillHint}</span>
                </div>
                <form className="form-grid" onSubmit={handleCreateWaybill}>
                  {[
                    [t.fieldShipper, 'shipperId'],
                    [t.fieldCarrier, 'carrierId'],
                    [t.fieldVehicle, 'vehicleId'],
                    [t.fieldMileage, 'mileageKm'],
                    [t.fieldWeight, 'weightKg'],
                    [t.fieldVolume, 'volumeM3'],
                    [t.fieldGoodsName, 'goodsName'],
                    [t.fieldLoadingFee, 'extraLoadingFee'],
                    [t.fieldSubsidy, 'subsidy'],
                    [t.fieldDeduction, 'deduction'],
                  ].map(([label, field]) => (
                    <label key={field}>
                      <span>{label}</span>
                      {field === 'shipperId' ? (
                        <select
                          value={draft.shipperId}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              shipperId: event.target.value,
                            }))
                          }
                        >
                          {bootstrap.references.shippers.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} / {item.name}
                            </option>
                          ))}
                        </select>
                      ) : field === 'carrierId' ? (
                        <select
                          value={draft.carrierId}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              carrierId: event.target.value,
                            }))
                          }
                        >
                          {bootstrap.references.carriers.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} / {item.name}
                            </option>
                          ))}
                        </select>
                      ) : field === 'vehicleId' ? (
                        <select
                          value={draft.vehicleId}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              vehicleId: event.target.value,
                            }))
                          }
                        >
                          {bootstrap.references.vehicles.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.id} / {item.plateNumber} / {item.truckType}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={String(draft[field as keyof typeof draft])}
                          onChange={(event) =>
                            setDraft((current) => ({
                              ...current,
                              [field]: event.target.value,
                            }))
                          }
                        />
                      )}
                    </label>
                  ))}
                  <button className="primary-button" type="submit" disabled={!can('waybill:create')}>{t.createButton}</button>
                  <button className="filter-button" type="button" onClick={() => void handleQuoteWaybill()} disabled={!can('waybill:create')}>
                    {t.actionQuote}
                  </button>
                  {submitMessage ? <p className="submit-message">{submitMessage}</p> : null}
                </form>
              </section>

              <section className="card">
                <div className="section-head">
                  <h3>{t.waybillListTitle}</h3>
                  <span>{t.waybillListHint}</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{t.waybillNo}</th>
                      <th>{t.status}</th>
                      <th>{t.goods}</th>
                      <th>{t.fieldMileage}</th>
                      <th>{t.totalFee}</th>
                      <th>{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedWaybills.map((item) => (
                      <tr key={item.id}>
                        <td>{item.waybillNo}</td>
                        <td>{translateStatus(item.status)}</td>
                        <td>{item.goodsName}</td>
                        <td>{item.mileageKm}</td>
                        <td>{money(item.totalAmount, locale)}</td>
                        <td>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() => void handlePickup(item)}
                            disabled={actionBusyId !== null || !can('waybill:transition') || item.status !== 'ASSIGNED'}
                          >
                            {t.actionPickup}
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() => void handleStartTransit(item)}
                            disabled={actionBusyId !== null || !can('waybill:transition') || item.status !== 'PICKED_UP'}
                          >
                            {t.actionStartTransit}
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() => void handleSign(item)}
                            disabled={actionBusyId !== null || !can('waybill:transition') || item.status !== 'IN_TRANSIT'}
                          >
                            {t.actionSign}
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() => void handleUploadPod(item)}
                            disabled={actionBusyId !== null || !can('pod:upload') || item.status !== 'SIGNED'}
                          >
                            {t.actionUploadPod}
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() => void handleDuplicateSignTest(item)}
                            disabled={actionBusyId !== null || !can('waybill:transition')}
                          >
                            {t.actionDupSignTest}
                          </button>
                          <button
                            type="button"
                            className="filter-button"
                            onClick={() => void handleDuplicatePodTest(item)}
                            disabled={actionBusyId !== null || !can('pod:upload')}
                          >
                            {t.actionDupPodTest}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="pagination-row">
                  <span>{waybillPageSummary}</span>
                  <div className="filter-row">
                    <button
                      type="button"
                      className="filter-button"
                      onClick={() => setWaybillPage((current) => Math.max(1, current - 1))}
                      disabled={waybillPage <= 1}
                    >
                      {t.pagePrev}
                    </button>
                    <button
                      type="button"
                      className="filter-button"
                      onClick={() => setWaybillPage((current) => Math.min(waybillPageCount, current + 1))}
                      disabled={waybillPage >= waybillPageCount}
                    >
                      {t.pageNext}
                    </button>
                  </div>
                </div>
                {actionMessage ? <p className="submit-message">{actionMessage}</p> : null}
              </section>
            </div>

            {renderImportSection()}
          </section>
        )}

        {active === 'import' && renderImportSection()}

        {active === 'warnings' && (
          <section className="card">
            <div className="section-head">
              <h3>{t.alertsTitle}</h3>
              <span>{t.alertsHint}</span>
            </div>
            <div className="filter-row">
              <button
                type="button"
                className={warningFilter === 'ALL' ? 'filter-button active' : 'filter-button'}
                onClick={() => setWarningFilter('ALL')}
              >
                {t.filterAll}
              </button>
              <button
                type="button"
                className={warningFilter === 'EXPIRED' ? 'filter-button active' : 'filter-button'}
                onClick={() => setWarningFilter('EXPIRED')}
              >
                {t.filterExpired}
              </button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>{t.fieldVehicle}</th>
                  <th>{t.vehicleCapacity}</th>
                  <th>{t.vehicleVolume}</th>
                  <th>{t.roadPermit}</th>
                  <th>{t.driverLicenseExpiry}</th>
                  <th>{t.status}</th>
                </tr>
              </thead>
              <tbody>
                {warningRows
                  .filter((item) =>
                    warningFilter === 'EXPIRED'
                      ? item.vehicleWarning?.status === 'EXPIRED' || item.driverWarning?.status === 'EXPIRED'
                      : true,
                  )
                  .map((row) => {
                    const roadPermitStatusText = formatWarningStatusText(row.vehicleWarning, t, translateStatus);
                    const driverLicenseStatusText = formatWarningStatusText(row.driverWarning, t, translateStatus);
                    const rowHasAlert =
                      isAlertWarningStatus(row.vehicleWarning?.status) || isAlertWarningStatus(row.driverWarning?.status);
                    const roadPermitAlert = isAlertWarningStatus(row.vehicleWarning?.status);
                    const driverAlert = isAlertWarningStatus(row.driverWarning?.status);
                    const roadPermitInvalid = row.vehicleWarning?.status === 'INVALID';
                    const driverInvalid = row.driverWarning?.status === 'INVALID';

                    return (
                      <tr key={row.id} className={rowHasAlert ? 'warning-row-red' : undefined}>
                        <td>{row.plateNumber}</td>
                        <td>{row.maxWeightKg}</td>
                        <td>{row.maxVolumeM3}</td>
                        <td>
                          <span className={roadPermitAlert ? 'warning-status-text alert' : roadPermitInvalid ? 'warning-status-text invalid' : 'warning-status-text'}>
                            {row.roadPermitExpiry} / {roadPermitStatusText}
                          </span>
                        </td>
                        <td>
                          <span className={driverAlert ? 'warning-status-text alert' : driverInvalid ? 'warning-status-text invalid' : 'warning-status-text'}>
                            {row.driver?.licenseExpiry ?? '-'} / {driverLicenseStatusText}
                          </span>
                        </td>
                        <td>
                          <div className={roadPermitAlert ? 'warning-status-text alert' : roadPermitInvalid ? 'warning-status-text invalid' : 'warning-status-text'}>
                            {t.roadPermit}: {roadPermitStatusText}
                          </div>
                          <div className={driverAlert ? 'warning-status-text alert' : driverInvalid ? 'warning-status-text invalid' : 'warning-status-text'}>
                            {t.driverLicenseExpiry}: {driverLicenseStatusText}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </section>
        )}

        {active === 'archives' && (
          <section className="panel-stack">
            <section className="card">
              <div className="section-head">
                <h3>{t.archivesTitle}</h3>
                <span>{t.archivesHint}</span>
              </div>

              <div className="filter-row">
                <button
                  type="button"
                  className={archiveTab === 'shippers' ? 'filter-button active' : 'filter-button'}
                  onClick={() => setArchiveTab('shippers')}
                >
                  {t.tabShippers}
                </button>
                <button
                  type="button"
                  className={archiveTab === 'carriers' ? 'filter-button active' : 'filter-button'}
                  onClick={() => setArchiveTab('carriers')}
                >
                  {t.tabCarriers}
                </button>
                <button
                  type="button"
                  className={archiveTab === 'vehicles' ? 'filter-button active' : 'filter-button'}
                  onClick={() => setArchiveTab('vehicles')}
                >
                  {t.tabVehicles}
                </button>
                <button
                  type="button"
                  className={archiveTab === 'drivers' ? 'filter-button active' : 'filter-button'}
                  onClick={() => setArchiveTab('drivers')}
                >
                  {t.tabDrivers}
                </button>
              </div>

              {archiveMessage ? <p className="submit-message">{archiveMessage}</p> : null}

              {archiveTab === 'shippers' && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.colId}</th>
                        <th>{t.colCode}</th>
                        <th>{t.colName}</th>
                        <th>{t.colContact}</th>
                        <th>{t.colPhone}</th>
                        <th>{t.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bootstrap.references.shippers.map((item) => (
                        <tr key={item.id}>
                          <td>{item.id}</td>
                          <td>{item.code}</td>
                          <td>{item.name}</td>
                          <td>{item.contactName}</td>
                          <td>{item.phone}</td>
                          <td>
                            <button
                              type="button"
                              className="filter-button"
                              disabled={!can('master:manage')}
                              onClick={() => {
                                setEditingShipperId(item.id);
                                setShipperDraft({
                                  code: item.code,
                                  name: item.name,
                                  contactName: item.contactName,
                                  phone: item.phone,
                                });
                                setArchiveMessage('');
                              }}
                            >
                              {t.actionEdit}
                            </button>
                            <button
                              type="button"
                              className="filter-button"
                              disabled={!can('master:manage')}
                              onClick={() => void handleDelete('shipper', item.id)}
                            >
                              {t.actionDelete}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <form className="form-grid" onSubmit={handleSaveShipper}>
                    <label><span>{t.formCode}</span><input value={shipperDraft.code} onChange={(e) => setShipperDraft((c) => ({ ...c, code: e.target.value }))} /></label>
                    <label><span>{t.formName}</span><input value={shipperDraft.name} onChange={(e) => setShipperDraft((c) => ({ ...c, name: e.target.value }))} /></label>
                    <label><span>{t.formContactName}</span><input value={shipperDraft.contactName} onChange={(e) => setShipperDraft((c) => ({ ...c, contactName: e.target.value }))} /></label>
                    <label><span>{t.formPhone}</span><input value={shipperDraft.phone} onChange={(e) => setShipperDraft((c) => ({ ...c, phone: e.target.value }))} /></label>
                    <button className="primary-button" type="submit" disabled={!can('master:manage')}>{editingShipperId ? t.actionSave : t.actionCreate}</button>
                    {editingShipperId ? (
                      <button type="button" className="filter-button" onClick={resetArchiveDrafts}>{t.actionCancelEdit}</button>
                    ) : null}
                  </form>
                </>
              )}

              {archiveTab === 'carriers' && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.colId}</th>
                        <th>{t.colCode}</th>
                        <th>{t.colName}</th>
                        <th>{t.colContact}</th>
                        <th>{t.colPhone}</th>
                        <th>{t.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bootstrap.references.carriers.map((item) => (
                        <tr key={item.id}>
                          <td>{item.id}</td>
                          <td>{item.code}</td>
                          <td>{item.name}</td>
                          <td>{item.contactName}</td>
                          <td>{item.phone}</td>
                          <td>
                            <button
                              type="button"
                              className="filter-button"
                              disabled={!can('master:manage')}
                              onClick={() => {
                                setEditingCarrierId(item.id);
                                setCarrierDraft({
                                  code: item.code,
                                  name: item.name,
                                  contactName: item.contactName,
                                  phone: item.phone,
                                });
                                setArchiveMessage('');
                              }}
                            >
                              {t.actionEdit}
                            </button>
                            <button
                              type="button"
                              className="filter-button"
                              disabled={!can('master:manage')}
                              onClick={() => void handleDelete('carrier', item.id)}
                            >
                              {t.actionDelete}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <form className="form-grid" onSubmit={handleSaveCarrier}>
                    <label><span>{t.formCode}</span><input value={carrierDraft.code} onChange={(e) => setCarrierDraft((c) => ({ ...c, code: e.target.value }))} /></label>
                    <label><span>{t.formName}</span><input value={carrierDraft.name} onChange={(e) => setCarrierDraft((c) => ({ ...c, name: e.target.value }))} /></label>
                    <label><span>{t.formContactName}</span><input value={carrierDraft.contactName} onChange={(e) => setCarrierDraft((c) => ({ ...c, contactName: e.target.value }))} /></label>
                    <label><span>{t.formPhone}</span><input value={carrierDraft.phone} onChange={(e) => setCarrierDraft((c) => ({ ...c, phone: e.target.value }))} /></label>
                    <button className="primary-button" type="submit" disabled={!can('master:manage')}>{editingCarrierId ? t.actionSave : t.actionCreate}</button>
                    {editingCarrierId ? (
                      <button type="button" className="filter-button" onClick={resetArchiveDrafts}>{t.actionCancelEdit}</button>
                    ) : null}
                  </form>
                </>
              )}

              {archiveTab === 'vehicles' && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.colId}</th>
                        <th>{t.colPlateNo}</th>
                        <th>{t.truckType}</th>
                        <th>{t.vehicleCapacity}</th>
                        <th>{t.vehicleVolume}</th>
                        <th>{t.colDriver}</th>
                        <th>{t.colExpiry}</th>
                        <th>{t.status}</th>
                        <th>{t.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bootstrap.references.vehicles.map((item) => {
                        const warning = warnings.find((w) => w.entityId === item.id && w.entityType === 'VEHICLE');
                        const driver = bootstrap.references.drivers.find((d) => d.id === item.assignedDriverId);
                        return (
                          <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>{item.plateNumber}</td>
                            <td>{item.truckType}</td>
                            <td>{item.maxWeightKg}</td>
                            <td>{item.maxVolumeM3}</td>
                            <td>{driver?.name ?? '-'}</td>
                            <td>{item.roadPermitExpiry}</td>
                            <td>{warning ? translateStatus(warning.status) : t.normal}</td>
                            <td>
                              <button
                                type="button"
                                className="filter-button"
                                disabled={!can('master:manage')}
                                onClick={() => {
                                  setEditingVehicleId(item.id);
                                  setVehicleDraft({
                                    plateNumber: item.plateNumber,
                                    truckType: item.truckType,
                                    maxWeightKg: item.maxWeightKg,
                                    maxVolumeM3: item.maxVolumeM3,
                                    roadPermitExpiry: item.roadPermitExpiry,
                                    assignedDriverId: item.assignedDriverId,
                                  });
                                  setArchiveMessage('');
                                }}
                              >
                                {t.actionEdit}
                              </button>
                              <button
                                type="button"
                                className="filter-button"
                                disabled={!can('master:manage')}
                                onClick={() => void handleDelete('vehicle', item.id)}
                              >
                                {t.actionDelete}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <form className="form-grid" onSubmit={handleSaveVehicle}>
                    <label><span>{t.formPlateNo}</span><input required value={vehicleDraft.plateNumber} onChange={(e) => setVehicleDraft((c) => ({ ...c, plateNumber: e.target.value }))} /></label>
                    <label>
                      <span>{t.truckType}</span>
                      <select value={vehicleDraft.truckType} onChange={(e) => setVehicleDraft((c) => ({ ...c, truckType: e.target.value as VehicleProfile['truckType'] }))}>
                        <option value="4.2M">4.2M</option>
                        <option value="6.8M">6.8M</option>
                        <option value="9.6M">9.6M</option>
                        <option value="17.5M">17.5M</option>
                      </select>
                    </label>
                    <label><span>{t.vehicleCapacity}</span><input value={String(vehicleDraft.maxWeightKg)} onChange={(e) => setVehicleDraft((c) => ({ ...c, maxWeightKg: Number(e.target.value) }))} /></label>
                    <label><span>{t.vehicleVolume}</span><input value={String(vehicleDraft.maxVolumeM3)} onChange={(e) => setVehicleDraft((c) => ({ ...c, maxVolumeM3: Number(e.target.value) }))} /></label>
                    <label><span>{t.formRoadPermitExpiry}</span><input type="date" required value={vehicleDraft.roadPermitExpiry} onChange={(e) => setVehicleDraft((c) => ({ ...c, roadPermitExpiry: e.target.value }))} /></label>
                    <label>
                      <span>{t.formAssignedDriver}</span>
                      <select value={vehicleDraft.assignedDriverId} onChange={(e) => setVehicleDraft((c) => ({ ...c, assignedDriverId: e.target.value }))}>
                        {bootstrap.references.drivers.map((driver) => (
                          <option key={driver.id} value={driver.id}>{driver.id} / {driver.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="primary-button" type="submit" disabled={!can('master:manage')}>{editingVehicleId ? t.actionSave : t.actionCreate}</button>
                    {editingVehicleId ? (
                      <button type="button" className="filter-button" onClick={resetArchiveDrafts}>{t.actionCancelEdit}</button>
                    ) : null}
                  </form>
                </>
              )}

              {archiveTab === 'drivers' && (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>{t.colId}</th>
                        <th>{t.formDriverName}</th>
                        <th>{t.colPhone}</th>
                        <th>{t.colLicenseNo}</th>
                        <th>{t.colExpiry}</th>
                        <th>{t.status}</th>
                        <th>{t.colActions}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bootstrap.references.drivers.map((item) => {
                        const warning = warnings.find((w) => w.entityId === item.id && w.entityType === 'DRIVER');
                        return (
                          <tr key={item.id}>
                            <td>{item.id}</td>
                            <td>{item.name}</td>
                            <td>{item.phone}</td>
                            <td>{item.licenseNumber}</td>
                            <td>{item.licenseExpiry}</td>
                            <td>{warning ? translateStatus(warning.status) : t.normal}</td>
                            <td>
                              <button
                                type="button"
                                className="filter-button"
                                disabled={!can('master:manage')}
                                onClick={() => {
                                  setEditingDriverId(item.id);
                                  setDriverDraft({
                                    name: item.name,
                                    phone: item.phone,
                                    licenseNumber: item.licenseNumber,
                                    licenseExpiry: item.licenseExpiry,
                                  });
                                  setArchiveMessage('');
                                }}
                              >
                                {t.actionEdit}
                              </button>
                              <button
                                type="button"
                                className="filter-button"
                                disabled={!can('master:manage')}
                                onClick={() => void handleDelete('driver', item.id)}
                              >
                                {t.actionDelete}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <form className="form-grid" onSubmit={handleSaveDriver}>
                    <label><span>{t.formDriverName}</span><input value={driverDraft.name} onChange={(e) => setDriverDraft((c) => ({ ...c, name: e.target.value }))} /></label>
                    <label><span>{t.formPhone}</span><input value={driverDraft.phone} onChange={(e) => setDriverDraft((c) => ({ ...c, phone: e.target.value }))} /></label>
                    <label><span>{t.formLicenseNo}</span><input value={driverDraft.licenseNumber} onChange={(e) => setDriverDraft((c) => ({ ...c, licenseNumber: e.target.value }))} /></label>
                    <label><span>{t.formLicenseExpiry}</span><input value={driverDraft.licenseExpiry} onChange={(e) => setDriverDraft((c) => ({ ...c, licenseExpiry: e.target.value }))} /></label>
                    <button className="primary-button" type="submit" disabled={!can('master:manage')}>{editingDriverId ? t.actionSave : t.actionCreate}</button>
                    {editingDriverId ? (
                      <button type="button" className="filter-button" onClick={resetArchiveDrafts}>{t.actionCancelEdit}</button>
                    ) : null}
                  </form>
                </>
              )}
            </section>
          </section>
        )}

        {active === 'settlement' && (
          <section className="panel-stack">
            <section className="card">
              <div className="section-head">
                <h3>{t.settlementTitle}</h3>
                <span>{t.settlementHint}</span>
              </div>
              <p>{t.settlementReloadHint}</p>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.shipper}</th>
                    <th>{t.truckType}</th>
                    <th>{t.mileageRange}</th>
                    <th>{t.unitPrice}</th>
                    <th>{t.loadingFee}</th>
                    <th>{t.insuranceRate}</th>
                    <th>{t.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {pricingRuleDrafts.map((rule, index) => (
                    <tr key={`${rule.shipperId}-${index}`}>
                      <td>
                        <select
                          value={rule.shipperId}
                          onChange={(event) =>
                            setPricingRuleDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, shipperId: event.target.value } : item,
                              ),
                            )
                          }
                        >
                          {bootstrap.references.shippers.map((item) => (
                            <option key={`pricing-shipper-${item.id}`} value={item.id}>{item.id}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          value={rule.truckType}
                          onChange={(event) =>
                            setPricingRuleDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, truckType: event.target.value as PricingRule['truckType'] } : item,
                              ),
                            )
                          }
                        >
                          <option value="4.2M">4.2M</option>
                          <option value="6.8M">6.8M</option>
                          <option value="9.6M">9.6M</option>
                          <option value="17.5M">17.5M</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <input
                            type="number"
                            step="1"
                            value={rule.minMileageKm}
                            onChange={(event) =>
                              setPricingRuleDrafts((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, minMileageKm: event.target.value } : item,
                                ),
                              )
                            }
                          />
                          <input
                            type="number"
                            step="1"
                            value={rule.maxMileageKm}
                            onChange={(event) =>
                              setPricingRuleDrafts((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, maxMileageKm: event.target.value } : item,
                                ),
                              )
                            }
                          />
                        </div>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={rule.unitPricePerKm}
                          onChange={(event) =>
                            setPricingRuleDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, unitPricePerKm: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={rule.loadingFee}
                          onChange={(event) =>
                            setPricingRuleDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, loadingFee: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={rule.insuranceRate}
                          onChange={(event) =>
                            setPricingRuleDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, insuranceRate: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={!can('master:manage')}
                          onClick={() => void handleSavePricingRule(rule)}
                        >
                          {t.actionSave}
                        </button>
                        <button
                          type="button"
                          className="filter-button"
                          disabled={!can('master:manage')}
                          onClick={() => void handleDeletePricingRule(index)}
                          style={{ marginLeft: '8px' }}
                        >
                          {t.actionDelete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-grid" onSubmit={handleCreatePricingRule}>
                <label>
                  <span>{t.shipper}</span>
                  <select
                    value={pricingRuleCreateDraft.shipperId}
                    onChange={(event) =>
                      setPricingRuleCreateDraft((current) =>
                        buildNextPricingRuleDraft(
                          pricingRuleDrafts.map((item) => toPricingRulePayload(item)),
                          {
                            shipperId: event.target.value,
                            truckType: current.truckType,
                            fallbackShipperId: event.target.value,
                          },
                        ),
                      )
                    }
                  >
                    {bootstrap.references.shippers.map((item) => (
                      <option key={`create-pricing-shipper-${item.id}`} value={item.id}>{item.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t.truckType}</span>
                  <select
                    value={pricingRuleCreateDraft.truckType}
                    onChange={(event) =>
                      setPricingRuleCreateDraft((current) =>
                        buildNextPricingRuleDraft(
                          pricingRuleDrafts.map((item) => toPricingRulePayload(item)),
                          {
                            shipperId: current.shipperId,
                            truckType: event.target.value as PricingRule['truckType'],
                            fallbackShipperId: current.shipperId,
                          },
                        ),
                      )
                    }
                  >
                    <option value="4.2M">4.2M</option>
                    <option value="6.8M">6.8M</option>
                    <option value="9.6M">9.6M</option>
                    <option value="17.5M">17.5M</option>
                  </select>
                </label>
                <label>
                  <span>{t.mileageRange}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <input type="number" step="1" value={pricingRuleCreateDraft.minMileageKm} onChange={(event) => setPricingRuleCreateDraft((current) => ({ ...current, minMileageKm: event.target.value }))} />
                    <input type="number" step="1" value={pricingRuleCreateDraft.maxMileageKm} onChange={(event) => setPricingRuleCreateDraft((current) => ({ ...current, maxMileageKm: event.target.value }))} />
                  </div>
                </label>
                <label>
                  <span>{t.unitPrice}</span>
                  <input type="number" step="any" value={pricingRuleCreateDraft.unitPricePerKm} onChange={(event) => setPricingRuleCreateDraft((current) => ({ ...current, unitPricePerKm: event.target.value }))} />
                </label>
                <label>
                  <span>{t.loadingFee}</span>
                  <input type="number" step="any" value={pricingRuleCreateDraft.loadingFee} onChange={(event) => setPricingRuleCreateDraft((current) => ({ ...current, loadingFee: event.target.value }))} />
                </label>
                <label>
                  <span>{t.insuranceRate}</span>
                  <input type="number" step="any" value={pricingRuleCreateDraft.insuranceRate} onChange={(event) => setPricingRuleCreateDraft((current) => ({ ...current, insuranceRate: event.target.value }))} />
                </label>
                <button className="primary-button" type="submit" disabled={!can('master:manage')}>{t.actionCreate}</button>
                {settlementMessage ? <p className="submit-message">{settlementMessage}</p> : null}
              </form>
            </section>

            <section className="card">
              <div className="section-head">
                <h3>{t.settlementEditAdjustments}</h3>
                <span>{t.settlementHint}</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.settlementCode}</th>
                    <th>{t.settlementLabel}</th>
                    <th>{t.settlementCategory}</th>
                    <th>{t.settlementMode}</th>
                    <th>{t.settlementValue}</th>
                    <th>{t.settlementEnabled}</th>
                    <th>{t.settlementScope}</th>
                    <th>{t.colActions}</th>
                  </tr>
                </thead>
                <tbody>
                  {settlementAdjustmentDrafts.map((rule, index) => (
                    <tr key={`${rule.code}-${index}`}>
                      <td>
                        <input
                          value={rule.code}
                          onChange={(event) =>
                            setSettlementAdjustmentDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, code: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          value={rule.label}
                          onChange={(event) =>
                            setSettlementAdjustmentDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, label: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={rule.category}
                          onChange={(event) =>
                            setSettlementAdjustmentDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, category: event.target.value as SettlementAdjustmentRule['category'] } : item,
                              ),
                            )
                          }
                        >
                          <option value="LOADING">LOADING</option>
                          <option value="DEDUCTION">DEDUCTION</option>
                        </select>
                      </td>
                      <td>
                        <select
                          value={rule.mode}
                          onChange={(event) =>
                            setSettlementAdjustmentDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, mode: event.target.value as SettlementAdjustmentRule['mode'] } : item,
                              ),
                            )
                          }
                        >
                          <option value="FIXED">FIXED</option>
                          <option value="LINE_HAUL_RATE">LINE_HAUL_RATE</option>
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          step="any"
                          value={rule.value}
                          onChange={(event) =>
                            setSettlementAdjustmentDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, value: event.target.value } : item,
                              ),
                            )
                          }
                        />
                      </td>
                      <td>
                        <select
                          value={rule.enabled ? '1' : '0'}
                          onChange={(event) =>
                            setSettlementAdjustmentDrafts((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, enabled: event.target.value === '1' } : item,
                              ),
                            )
                          }
                        >
                          <option value="1">Y</option>
                          <option value="0">N</option>
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <select
                            value={rule.shipperId ?? ''}
                            onChange={(event) =>
                              setSettlementAdjustmentDrafts((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, shipperId: event.target.value || undefined } : item,
                                ),
                              )
                            }
                          >
                            <option value="">*</option>
                            {bootstrap.references.shippers.map((item) => (
                              <option key={`adj-shipper-${item.id}-${index}`} value={item.id}>{item.id}</option>
                            ))}
                          </select>
                          <select
                            value={rule.truckType ?? ''}
                            onChange={(event) =>
                              setSettlementAdjustmentDrafts((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, truckType: (event.target.value || undefined) as SettlementAdjustmentRule['truckType'] }
                                    : item,
                                ),
                              )
                            }
                          >
                            <option value="">*</option>
                            <option value="4.2M">4.2M</option>
                            <option value="6.8M">6.8M</option>
                            <option value="9.6M">9.6M</option>
                            <option value="17.5M">17.5M</option>
                          </select>
                        </div>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={!can('master:manage')}
                          onClick={() => void handleSaveSettlementAdjustmentRow(rule)}
                        >
                          {t.actionSave}
                        </button>
                        <button
                          type="button"
                          className="filter-button"
                          disabled={!can('master:manage')}
                          onClick={() => void handleDeleteSettlementAdjustment(index)}
                          style={{ marginLeft: '8px' }}
                        >
                          {t.actionDelete}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <form className="form-grid" onSubmit={handleSaveSettlementAdjustment}>
                <label>
                  <span>{t.settlementCode}</span>
                  <input value={settlementAdjustmentDraft.code} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, code: event.target.value }))} />
                </label>
                <label>
                  <span>{t.settlementLabel}</span>
                  <input value={settlementAdjustmentDraft.label} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, label: event.target.value }))} />
                </label>
                <label>
                  <span>{t.settlementCategory}</span>
                  <select value={settlementAdjustmentDraft.category} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, category: event.target.value as SettlementAdjustmentRule['category'] }))}>
                    <option value="LOADING">LOADING</option>
                    <option value="DEDUCTION">DEDUCTION</option>
                  </select>
                </label>
                <label>
                  <span>{t.settlementMode}</span>
                  <select value={settlementAdjustmentDraft.mode} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, mode: event.target.value as SettlementAdjustmentRule['mode'] }))}>
                    <option value="FIXED">FIXED</option>
                    <option value="LINE_HAUL_RATE">LINE_HAUL_RATE</option>
                  </select>
                </label>
                <label>
                  <span>{t.settlementValue}</span>
                  <input type="number" step="any" value={settlementAdjustmentDraft.value} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, value: event.target.value }))} />
                </label>
                <label>
                  <span>{t.shipper}</span>
                  <select value={settlementAdjustmentDraft.shipperId ?? ''} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, shipperId: event.target.value || undefined }))}>
                    <option value="">*</option>
                    {bootstrap.references.shippers.map((item) => (
                      <option key={item.id} value={item.id}>{item.id}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t.truckType}</span>
                  <select value={settlementAdjustmentDraft.truckType ?? ''} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, truckType: (event.target.value || undefined) as SettlementAdjustmentRule['truckType'] }))}>
                    <option value="">*</option>
                    <option value="4.2M">4.2M</option>
                    <option value="6.8M">6.8M</option>
                    <option value="9.6M">9.6M</option>
                    <option value="17.5M">17.5M</option>
                  </select>
                </label>
                <label>
                  <span>{t.settlementEnabled}</span>
                  <select value={settlementAdjustmentDraft.enabled ? '1' : '0'} onChange={(event) => setSettlementAdjustmentDraft((current) => ({ ...current, enabled: event.target.value === '1' }))}>
                    <option value="1">Y</option>
                    <option value="0">N</option>
                  </select>
                </label>
                <button className="primary-button" type="submit" disabled={!can('master:manage')}>{t.actionCreate}</button>
                {settlementMessage ? <p className="submit-message">{settlementMessage}</p> : null}
              </form>
            </section>

            <section className="card">
              <div className="section-head">
                <h3>{t.settlementWaybillTitle}</h3>
                <span>{t.settlementWaybillHint}</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t.waybillNo}</th>
                    <th>{t.status}</th>
                    <th>{t.payableAmount}</th>
                    <th>{t.feeDetails}</th>
                  </tr>
                </thead>
                <tbody>
                  {waybills.length === 0 ? (
                    <tr>
                      <td colSpan={4}>{t.noSettlementData}</td>
                    </tr>
                  ) : (
                    waybills.slice(0, 12).map((item) => (
                      <tr key={`settlement-${item.id}`}>
                        <td>{item.waybillNo}</td>
                        <td>{translateStatus(item.status)}</td>
                        <td style={{ color: item.totalAmount < 0 ? '#b42318' : undefined, fontWeight: item.totalAmount < 0 ? 700 : 500 }}>
                          {money(item.totalAmount, locale)}
                          {item.totalAmount < 0 ? ` (${t.negativePayableTag})` : ''}
                        </td>
                        <td>
                          {item.fees.map((fee) => `${fee.label}: ${money(fee.amount, locale)} (${fee.formula})`).join(' | ')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="card timeline-card">
              <div className="section-head">
                <h3>{t.timelineTitle}</h3>
                <span>{t.timelineHint}</span>
              </div>
              <div className="timeline">
                {bootstrap.statusFlow.map((node) => (
                  <div key={node.status} className="timeline-node">
                    <strong>{translateStatus(node.status)}</strong>
                    <span>{node.next.length > 0 ? node.next.map((item) => translateStatus(item)).join(' / ') : t.endStatus}</span>
                  </div>
                ))}
              </div>
            </section>
          </section>
        )}

        {active === 'architecture' && (
          <section className="panel-stack">
            <section className="card architecture-board">
              <div className="section-head">
                <h3>{t.architectureTitle}</h3>
                <span>{t.architectureHint}</span>
              </div>
              <div className="arch-grid">
                <article>
                  <strong>Web / Nginx</strong>
                  <p>{t.archWeb}</p>
                </article>
                <article>
                  <strong>App Servers</strong>
                  <p>{t.archApp}</p>
                </article>
                <article>
                  <strong>RabbitMQ</strong>
                  <p>{t.archMq}</p>
                </article>
                <article>
                  <strong>MySQL Shards</strong>
                  <p>{t.archDb}</p>
                </article>
                <article>
                  <strong>Redis</strong>
                  <p>{t.archRedis}</p>
                </article>
                <article>
                  <strong>Observability</strong>
                  <p>{t.archObs}</p>
                </article>
              </div>
            </section>

            <section className="card cache-board">
              <div className="section-head">
                <h3>{t.cacheBoardTitle}</h3>
                <span>{t.cacheBoardHint}</span>
              </div>
              {cacheScenarios ? (
                <div className="cache-board-grid">
                  <article>
                    <strong>{t.cacheArchiveCoverage}</strong>
                    <p>
                      shipper:{cacheScenarios.scenarios.archiveDetailCache.shipperDetailCount} / carrier:{' '}
                      {cacheScenarios.scenarios.archiveDetailCache.carrierDetailCount} / vehicle:{' '}
                      {cacheScenarios.scenarios.archiveDetailCache.vehicleDetailCount} / driver:{' '}
                      {cacheScenarios.scenarios.archiveDetailCache.driverDetailCount}
                    </p>
                  </article>
                  <article>
                    <strong>{t.cacheLockCoverage}</strong>
                    <p>
                      {cacheScenarios.scenarios.distributedLockCache.keyPattern} ={' '}
                      {cacheScenarios.scenarios.distributedLockCache.keyCount}
                    </p>
                  </article>
                  <article>
                    <strong>{t.cacheIdemCoverage}</strong>
                    <p>
                      {cacheScenarios.scenarios.idempotencyCache.keyPattern} ={' '}
                      {cacheScenarios.scenarios.idempotencyCache.keyCount}
                    </p>
                  </article>
                  <article>
                    <strong>{t.cacheDashboardCoverage}</strong>
                    <p>
                      dashboard:{cacheScenarios.scenarios.dashboardHotCache.dashboardCount} / recent:{' '}
                      {cacheScenarios.scenarios.dashboardHotCache.waybillRecentCount} / bootstrap:{' '}
                      {cacheScenarios.scenarios.dashboardHotCache.bootstrapCount}
                    </p>
                  </article>
                  <article className="cache-wide">
                    <strong>{t.cacheSampleKeys}</strong>
                    <p>{cacheScenarios.samples.archiveDetailKeys.join(' | ') || '-'}</p>
                  </article>
                  <article className="cache-wide">
                    <strong>{t.cachePolicy}</strong>
                    <p>
                      {t.cacheTtl}: archive={cacheScenarios.policy.ttlSeconds.archiveDetail}s, null={cacheScenarios.policy.ttlSeconds.archiveNullValue}s,
                      dashboard={cacheScenarios.policy.ttlSeconds.dashboard}s, recent={cacheScenarios.policy.ttlSeconds.waybillRecent}s,
                      idempotency={cacheScenarios.policy.ttlSeconds.idempotencySnapshot}s
                    </p>
                    <p>
                      {t.cachePenetration}: {cacheScenarios.policy.antiPenetration}
                    </p>
                    <p>
                      {t.cacheBreakdown}: {cacheScenarios.policy.antiBreakdown}
                    </p>
                  </article>
                </div>
              ) : (
                <p>{locale === 'en-US' ? 'Cache scenarios are loading...' : '缓存场景加载中...'}</p>
              )}
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
