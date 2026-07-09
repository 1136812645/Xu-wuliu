import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { createCarrier, createDriver, createShipper, createVehicle, deletePricingRule, deleteSettlementAdjustmentRule, createWaybill, devLogin, deleteCarrier, deleteDriver, deleteShipper, deleteVehicle, fetchSettlementAdjustmentRules, fetchAuthConfig, fetchAuthMe, fetchBootstrap, fetchCacheScenarios, fetchDashboard, fetchPricingRules, importWaybillChunk, fetchWarnings, fetchWaybills, loginWithGoogle, loginWithPassword, logout, quoteWaybill, registerWithPassword, savePricingRule, saveSettlementAdjustmentRule, signWaybill, setAuthToken, uploadPod, updateCarrier, updateDriver, updateShipper, updateVehicle, } from './api';
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
};
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
const emptyPartyDraft = {
    code: '',
    name: '',
    contactName: '',
    phone: '',
};
const emptyVehicleDraft = {
    plateNumber: '',
    truckType: '9.6M',
    maxWeightKg: 0,
    maxVolumeM3: 0,
    roadPermitExpiry: '',
    assignedDriverId: 'driver-1',
};
const emptyDriverDraft = {
    name: '',
    phone: '',
    licenseNumber: '',
    licenseExpiry: '',
};
const emptySettlementAdjustmentDraft = {
    code: '',
    label: '',
    category: 'LOADING',
    mode: 'FIXED',
    value: '0',
    enabled: true,
};
const emptyPricingRuleDraft = {
    shipperId: 'shipper-1',
    truckType: '9.6M',
    minMileageKm: '0',
    maxMileageKm: '300',
    unitPricePerKm: '0',
    loadingFee: '0',
    insuranceRate: '0',
};
function toPricingRuleDraft(rule) {
    return {
        ...rule,
        minMileageKm: String(rule.minMileageKm),
        maxMileageKm: String(rule.maxMileageKm),
        unitPricePerKm: String(rule.unitPricePerKm),
        loadingFee: String(rule.loadingFee),
        insuranceRate: String(rule.insuranceRate),
    };
}
function toSettlementAdjustmentDraft(rule) {
    return {
        ...rule,
        value: String(rule.value),
    };
}
function parseDraftNumber(value, label) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${label} must be a valid number.`);
    }
    return parsed;
}
function toPricingRulePayload(rule) {
    return {
        ...rule,
        minMileageKm: parseDraftNumber(rule.minMileageKm, 'minMileageKm'),
        maxMileageKm: parseDraftNumber(rule.maxMileageKm, 'maxMileageKm'),
        unitPricePerKm: parseDraftNumber(rule.unitPricePerKm, 'unitPricePerKm'),
        loadingFee: parseDraftNumber(rule.loadingFee, 'loadingFee'),
        insuranceRate: parseDraftNumber(rule.insuranceRate, 'insuranceRate'),
    };
}
function toSettlementAdjustmentPayload(rule) {
    return {
        ...rule,
        value: parseDraftNumber(rule.value, 'value'),
    };
}
function money(value, locale) {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
    }).format(value);
}
function createIdempotencyKey() {
    const maybeCrypto = globalThis.crypto;
    if (maybeCrypto?.randomUUID) {
        return maybeCrypto.randomUUID();
    }
    return `idem-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function isAlertWarningStatus(status) {
    return status === 'EXPIRED' || status === 'EXPIRING_SOON';
}
function formatWarningStatusText(warning, t, translateStatus) {
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
async function parseCsvFile(file) {
    const content = await file.text();
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length <= 1) {
        return [];
    }
    const rows = [];
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
function chunkRows(rows, size) {
    const chunks = [];
    for (let i = 0; i < rows.length; i += size) {
        chunks.push(rows.slice(i, i + size));
    }
    return chunks;
}
export function App() {
    const [locale, setLocale] = useState(() => {
        const saved = globalThis.localStorage?.getItem(LOCALE_STORAGE_KEY);
        return saved === 'en-US' ? 'en-US' : 'zh-CN';
    });
    const [active, setActive] = useState('overview');
    const [authConfig, setAuthConfig] = useState(null);
    const [authUser, setAuthUser] = useState(null);
    const [authMessage, setAuthMessage] = useState('');
    const [authLoading, setAuthLoading] = useState(true);
    const [googleUiState, setGoogleUiState] = useState('idle');
    const [googleRetrySeed, setGoogleRetrySeed] = useState(0);
    const [devLoginForm, setDevLoginForm] = useState({
        email: 'admin@example.com',
        password: '123456',
        role: 'ADMIN',
    });
    const [passwordLoginForm, setPasswordLoginForm] = useState({
        email: '1806909748@qq.com',
        password: '',
    });
    const [registerForm, setRegisterForm] = useState({
        email: '',
        name: '',
        role: 'SHIPPER',
        password: '',
    });
    const [bootstrap, setBootstrap] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [waybills, setWaybills] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [warningFilter, setWarningFilter] = useState('ALL');
    const [draft, setDraft] = useState(defaultDraft);
    const [submitMessage, setSubmitMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [archiveTab, setArchiveTab] = useState('shippers');
    const [archiveMessage, setArchiveMessage] = useState('');
    const [editingShipperId, setEditingShipperId] = useState(null);
    const [editingCarrierId, setEditingCarrierId] = useState(null);
    const [editingVehicleId, setEditingVehicleId] = useState(null);
    const [editingDriverId, setEditingDriverId] = useState(null);
    const [shipperDraft, setShipperDraft] = useState(emptyPartyDraft);
    const [carrierDraft, setCarrierDraft] = useState(emptyPartyDraft);
    const [vehicleDraft, setVehicleDraft] = useState(emptyVehicleDraft);
    const [driverDraft, setDriverDraft] = useState(emptyDriverDraft);
    const [actionMessage, setActionMessage] = useState('');
    const [actionBusyId, setActionBusyId] = useState(null);
    const [cacheScenarios, setCacheScenarios] = useState(null);
    const [importFile, setImportFile] = useState(null);
    const [importChunkSize, setImportChunkSize] = useState(800);
    const [importBusy, setImportBusy] = useState(false);
    const [importProgress, setImportProgress] = useState({ done: 0, total: 0, created: 0, failed: 0 });
    const [waybillPage, setWaybillPage] = useState(1);
    const [settlementMessage, setSettlementMessage] = useState('');
    const [pricingRuleDrafts, setPricingRuleDrafts] = useState([]);
    const [pricingRuleCreateDraft, setPricingRuleCreateDraft] = useState(emptyPricingRuleDraft);
    const [settlementAdjustmentDrafts, setSettlementAdjustmentDrafts] = useState([]);
    const [settlementAdjustmentDraft, setSettlementAdjustmentDraft] = useState(emptySettlementAdjustmentDraft);
    const [importReport, setImportReport] = useState(null);
    const t = I18N[locale];
    const permissionSet = new Set(authUser?.permissions ?? []);
    function can(permission) {
        return permissionSet.has(permission);
    }
    function isUnauthorizedErrorMessage(message) {
        const normalized = message.toLowerCase();
        return normalized.includes('unauthorized') || normalized.includes('please login first');
    }
    function resetToLogin(message) {
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
    const navItems = useMemo(() => [
        { key: 'overview', label: t.navOverview, visible: can('dashboard:view') },
        { key: 'waybills', label: t.navWaybills, visible: can('waybill:view') },
        { key: 'import', label: t.navImport, visible: can('waybill:create') },
        { key: 'warnings', label: t.navWarnings, visible: can('master:manage') },
        { key: 'archives', label: t.navArchives, visible: can('master:manage') },
        { key: 'settlement', label: t.navSettlement, visible: can('settlement:view') },
        { key: 'architecture', label: t.navArchitecture, visible: can('report:view') },
    ].filter((item) => item.visible), [t, permissionSet]);
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
                }
                catch (error) {
                    if (!cancelled) {
                        const message = error instanceof Error ? error.message : 'auth init failed';
                        setAuthToken(null);
                        setAuthUser(null);
                        if (!isUnauthorizedErrorMessage(message)) {
                            setAuthMessage(message);
                        }
                    }
                }
            }
            catch (error) {
                if (!cancelled) {
                    setAuthMessage(error instanceof Error ? error.message : 'auth init failed');
                }
            }
            finally {
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
        const renderGoogleButton = () => {
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
                    }
                    catch (error) {
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
        const existing = document.getElementById(scriptId);
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
    async function handleDevLogin(event) {
        event.preventDefault();
        try {
            const result = await devLogin(devLoginForm);
            setAuthToken(result.token);
            setAuthUser(result.user);
            setAuthMessage('');
        }
        catch (error) {
            setAuthMessage(error instanceof Error ? error.message : 'dev login failed');
        }
    }
    async function handlePasswordLogin(event) {
        event.preventDefault();
        try {
            const result = await loginWithPassword(passwordLoginForm);
            setAuthToken(result.token);
            setAuthUser(result.user);
            setAuthMessage('');
        }
        catch (error) {
            setAuthMessage(error instanceof Error ? error.message : 'password login failed');
        }
    }
    async function handleRegister(event) {
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
        }
        catch (error) {
            setAuthMessage(error instanceof Error ? error.message : 'register failed');
        }
    }
    async function handleLogout() {
        try {
            await logout();
        }
        finally {
            setAuthToken(null);
            setAuthUser(null);
            setBootstrap(null);
            setDashboard(null);
            setWaybills([]);
            setWarnings([]);
        }
    }
    function translateStatus(status) {
        if (locale === 'en-US') {
            return status;
        }
        const map = {
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
                    setSettlementAdjustmentDrafts(adjustmentData.items.map((rule) => toSettlementAdjustmentDraft(rule)));
                    setCacheScenarios(cacheScenarioData);
                }
            }
            catch (error) {
                if (!cancelled) {
                    const message = error instanceof Error ? error.message : 'unknown error';
                    if (isUnauthorizedErrorMessage(message)) {
                        resetToLogin(message);
                        return;
                    }
                    setLoadError(message);
                }
            }
            finally {
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
        const vehicleWarningMap = new Map(warnings.filter((item) => item.entityType === 'VEHICLE').map((item) => [item.entityId, item]));
        const driverWarningMap = new Map(warnings.filter((item) => item.entityType === 'DRIVER').map((item) => [item.entityId, item]));
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
        setSettlementAdjustmentDrafts(adjustmentData.items.map((rule) => toSettlementAdjustmentDraft(rule)));
        setCacheScenarios(cacheScenarioData);
    }
    async function handleSavePricingRule(rule) {
        if (!can('master:manage')) {
            setSettlementMessage(t.noPermission);
            return;
        }
        try {
            await savePricingRule(toPricingRulePayload(rule));
            await reloadReferences();
            setSettlementMessage(t.saveSuccess);
        }
        catch (error) {
            setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleCreatePricingRule(event) {
        event.preventDefault();
        if (!can('master:manage')) {
            setSettlementMessage(t.noPermission);
            return;
        }
        try {
            await savePricingRule(toPricingRulePayload(pricingRuleCreateDraft));
            await reloadReferences();
            setPricingRuleCreateDraft({ ...emptyPricingRuleDraft });
            setSettlementMessage(t.saveSuccess);
        }
        catch (error) {
            setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleDeletePricingRule(index) {
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
        }
        catch (error) {
            setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleSaveSettlementAdjustment(event) {
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
        }
        catch (error) {
            setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleSaveSettlementAdjustmentRow(rule) {
        if (!can('master:manage')) {
            setSettlementMessage(t.noPermission);
            return;
        }
        try {
            await saveSettlementAdjustmentRule(toSettlementAdjustmentPayload(rule));
            await reloadReferences();
            setSettlementMessage(t.saveSuccess);
        }
        catch (error) {
            setSettlementMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleDeleteSettlementAdjustment(index) {
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
        }
        catch (error) {
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
    async function handleSaveShipper(event) {
        event.preventDefault();
        if (!can('master:manage')) {
            setArchiveMessage(t.noPermission);
            return;
        }
        try {
            if (editingShipperId) {
                await updateShipper(editingShipperId, shipperDraft);
            }
            else {
                await createShipper(shipperDraft);
            }
            await reloadReferences();
            resetArchiveDrafts();
            setArchiveMessage(t.saveSuccess);
        }
        catch (error) {
            setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleSaveCarrier(event) {
        event.preventDefault();
        if (!can('master:manage')) {
            setArchiveMessage(t.noPermission);
            return;
        }
        try {
            if (editingCarrierId) {
                await updateCarrier(editingCarrierId, carrierDraft);
            }
            else {
                await createCarrier(carrierDraft);
            }
            await reloadReferences();
            resetArchiveDrafts();
            setArchiveMessage(t.saveSuccess);
        }
        catch (error) {
            setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleSaveVehicle(event) {
        event.preventDefault();
        if (!can('master:manage')) {
            setArchiveMessage(t.noPermission);
            return;
        }
        try {
            const payload = {
                ...vehicleDraft,
                maxWeightKg: Number(vehicleDraft.maxWeightKg),
                maxVolumeM3: Number(vehicleDraft.maxVolumeM3),
            };
            if (editingVehicleId) {
                await updateVehicle(editingVehicleId, payload);
            }
            else {
                await createVehicle(payload);
            }
            await reloadReferences();
            resetArchiveDrafts();
            setArchiveMessage(t.saveSuccess);
        }
        catch (error) {
            setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleSaveDriver(event) {
        event.preventDefault();
        if (!can('master:manage')) {
            setArchiveMessage(t.noPermission);
            return;
        }
        try {
            if (editingDriverId) {
                await updateDriver(editingDriverId, driverDraft);
            }
            else {
                await createDriver(driverDraft);
            }
            await reloadReferences();
            resetArchiveDrafts();
            setArchiveMessage(t.saveSuccess);
        }
        catch (error) {
            setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleDelete(type, id) {
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
            }
            else if (type === 'carrier') {
                await deleteCarrier(id);
            }
            else if (type === 'vehicle') {
                await deleteVehicle(id);
            }
            else {
                await deleteDriver(id);
            }
            await reloadReferences();
            resetArchiveDrafts();
            setArchiveMessage(t.saveSuccess);
        }
        catch (error) {
            setArchiveMessage(`${t.saveFailed}: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
    }
    async function handleCreateWaybill(event) {
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
        const matchedRule = bootstrap.references.pricingRules.find((rule) => rule.shipperId === draft.shipperId &&
            rule.truckType === vehicle.truckType &&
            mileage >= rule.minMileageKm &&
            mileage <= rule.maxMileageKm);
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
                setSubmitMessage(`${t.splitAppliedHint}: ${result.splitCount}，overweight=${result.overweightKg}kg，overVolume=${result.overVolumeM3}m3`);
            }
            else {
                const createdRecord = result;
                setWaybills((current) => [createdRecord, ...current]);
                setSubmitMessage(`${t.createdOk} ${createdRecord.waybillNo}，${t.totalAmountLabel} ${money(createdRecord.totalAmount, locale)}`);
            }
        }
        catch (error) {
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
            setSubmitMessage(`${capacityPart} | quote=${money(result.fee.totalAmount, locale)} | shard=${result.fee.shardTable}`);
        }
        catch (error) {
            setSubmitMessage(error instanceof Error ? error.message : t.createFailed);
        }
    }
    function unwrapTransitionRecord(result) {
        if ('idempotentBlocked' in result) {
            return result.data;
        }
        return result;
    }
    function upsertWaybillRecord(record) {
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
    async function handleSign(item) {
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
            }
            else {
                setActionMessage(`${t.actionSign} success: ${record.waybillNo}`);
            }
        }
        catch (error) {
            setActionMessage(error instanceof Error ? error.message : t.createFailed);
        }
        finally {
            setActionBusyId(null);
        }
    }
    async function handleUploadPod(item) {
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
            }
            else {
                setActionMessage(`${t.actionUploadPod} success: ${record.waybillNo}`);
            }
        }
        catch (error) {
            setActionMessage(error instanceof Error ? error.message : t.createFailed);
        }
        finally {
            setActionBusyId(null);
        }
    }
    async function handleDuplicateSignTest(item) {
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
            }
            else {
                setActionMessage('Duplicate sign was not blocked.');
            }
        }
        catch (error) {
            setActionMessage(error instanceof Error ? error.message : t.createFailed);
        }
        finally {
            setActionBusyId(null);
        }
    }
    async function handleDuplicatePodTest(item) {
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
            }
            else {
                setActionMessage('Duplicate upload-pod was not blocked.');
            }
        }
        catch (error) {
            setActionMessage(error instanceof Error ? error.message : t.createFailed);
        }
        finally {
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
                const result = await importWaybillChunk({
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
        }
        catch (error) {
            setActionMessage(error instanceof Error ? error.message : t.createFailed);
        }
        finally {
            setImportBusy(false);
        }
    }
    function renderImportSection() {
        if (!can('waybill:create')) {
            return null;
        }
        return (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.importTitle }), _jsx("span", { children: t.importHint })] }), _jsxs("div", { className: "form-grid", children: [_jsxs("label", { children: [_jsx("span", { children: t.importPickFile }), _jsx("input", { type: "file", accept: ".csv", onChange: (event) => setImportFile(event.target.files?.[0] ?? null), disabled: importBusy })] }), _jsxs("label", { children: [_jsx("span", { children: t.importChunkSize }), _jsx("input", { type: "number", min: 50, max: 1000, value: importChunkSize, onChange: (event) => setImportChunkSize(Number(event.target.value) || 800), disabled: importBusy })] }), _jsx("button", { className: "primary-button", type: "button", onClick: () => void handleImport10k(), disabled: importBusy || !can('waybill:create'), children: t.importStart })] }), _jsxs("div", { className: "import-progress-row", children: [_jsx("strong", { children: t.importProgress }), _jsxs("span", { children: [importProgress.done, "/", importProgress.total] }), _jsxs("span", { children: [t.importCreated, ": ", importProgress.created] }), _jsxs("span", { children: [t.importFailed, ": ", importProgress.failed] })] }), importReport ? (_jsxs("div", { className: "import-report-grid", children: [_jsxs("article", { children: [_jsx("strong", { children: t.importDuration }), _jsxs("p", { children: [importReport.durationSec, "s"] })] }), _jsxs("article", { children: [_jsx("strong", { children: t.importStorage }), _jsx("p", { children: importReport.storage })] }), _jsxs("article", { children: [_jsx("strong", { children: t.importPeakHeap }), _jsx("p", { children: importReport.peakHeapAfterMB })] }), _jsxs("article", { children: [_jsx("strong", { children: "Batch" }), _jsxs("p", { children: [importReport.importBatchId, " / chunks=", importReport.chunkCount] })] })] })) : null] }));
    }
    if (authLoading) {
        return _jsx("div", { className: "loading-shell", children: t.loading });
    }
    if (!authUser) {
        return (_jsx("div", { className: "loading-shell", children: _jsxs("div", { className: "card", style: { maxWidth: 560, width: '100%', textAlign: 'left' }, children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.loginTitle }), _jsx("span", { children: t.loginHint })] }), _jsxs("div", { className: "filter-row", style: { marginBottom: 12 }, children: [_jsx("button", { type: "button", className: locale === 'zh-CN' ? 'filter-button active' : 'filter-button', onClick: () => setLocale('zh-CN'), children: "\u4E2D\u6587" }), _jsx("button", { type: "button", className: locale === 'en-US' ? 'filter-button active' : 'filter-button', onClick: () => setLocale('en-US'), children: "EN" })] }), authConfig?.googleEnabled ? (_jsxs(_Fragment, { children: [_jsx("p", { children: t.loginByGoogle }), _jsx("div", { id: "google-login-btn" }), googleUiState === 'loading' ? _jsx("p", { children: t.googleLoading }) : null, googleUiState === 'error' ? (_jsxs(_Fragment, { children: [_jsx("p", { className: "submit-message", children: t.googleUnavailable }), _jsx("button", { className: "filter-button", type: "button", onClick: () => setGoogleRetrySeed((value) => value + 1), children: t.googleRetry })] })) : null] })) : (_jsx("p", { children: t.googleNotConfigured })), authConfig?.devLoginEnabled ? (_jsxs("div", { className: "panel-stack", children: [_jsx("h4", { children: t.passwordLogin }), _jsxs("form", { className: "form-grid", onSubmit: handlePasswordLogin, children: [_jsxs("label", { children: [_jsx("span", { children: t.devEmail }), _jsx("input", { value: passwordLoginForm.email, onChange: (event) => setPasswordLoginForm((current) => ({ ...current, email: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.password }), _jsx("input", { type: "password", value: passwordLoginForm.password, onChange: (event) => setPasswordLoginForm((current) => ({ ...current, password: event.target.value })) })] }), _jsx("button", { className: "primary-button", type: "submit", children: t.loginButton })] }), _jsx("h4", { children: t.registerAccount }), _jsxs("form", { className: "form-grid", onSubmit: handleRegister, children: [_jsxs("label", { children: [_jsx("span", { children: t.devEmail }), _jsx("input", { value: registerForm.email, onChange: (event) => setRegisterForm((current) => ({ ...current, email: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.devName }), _jsx("input", { value: registerForm.name, onChange: (event) => setRegisterForm((current) => ({ ...current, name: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.devRole }), _jsxs("select", { value: registerForm.role, onChange: (event) => setRegisterForm((current) => ({
                                                    ...current,
                                                    role: event.target.value,
                                                })), children: [_jsx("option", { value: "SHIPPER", children: "SHIPPER" }), _jsx("option", { value: "CARRIER", children: "CARRIER" })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.password }), _jsx("input", { type: "password", placeholder: t.passwordHint, value: registerForm.password, onChange: (event) => setRegisterForm((current) => ({ ...current, password: event.target.value })) })] }), _jsx("button", { className: "primary-button", type: "submit", children: t.registerButton })] }), _jsx("h4", { children: t.devLogin }), _jsxs("form", { className: "form-grid", onSubmit: handleDevLogin, children: [_jsxs("label", { children: [_jsx("span", { children: t.devEmail }), _jsx("input", { value: devLoginForm.email, onChange: (event) => setDevLoginForm((current) => ({ ...current, email: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.password }), _jsx("input", { type: "password", placeholder: t.passwordHint, value: devLoginForm.password, onChange: (event) => setDevLoginForm((current) => ({ ...current, password: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.devRole }), _jsxs("select", { value: devLoginForm.role, onChange: (event) => setDevLoginForm((current) => ({ ...current, role: event.target.value })), children: [_jsx("option", { value: "ADMIN", children: "ADMIN" }), _jsx("option", { value: "SHIPPER", children: "SHIPPER" }), _jsx("option", { value: "CARRIER", children: "CARRIER" })] })] }), _jsx("button", { className: "filter-button", type: "submit", children: t.devLogin })] })] })) : null, authMessage ? _jsx("p", { className: "submit-message", children: authMessage }) : null] }) }));
    }
    if (loading || !bootstrap || !dashboard) {
        if (!loading && loadError) {
            return (_jsx("div", { className: "loading-shell", children: _jsxs("div", { className: "card", style: { maxWidth: 560, width: '100%', textAlign: 'left' }, children: [_jsxs("p", { className: "submit-message", children: [t.loadFailed, loadError] }), _jsx("button", { type: "button", className: "primary-button", onClick: () => resetToLogin(loadError), children: locale === 'en-US' ? 'Back to login' : '返回登录' })] }) }));
        }
        return _jsx("div", { className: "loading-shell", children: t.loading });
    }
    return (_jsxs("div", { className: "shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: t.internalSuite }), _jsx("h1", { children: t.title }), _jsx("p", { className: "sidebar-copy", children: t.subtitle })] }), _jsxs("div", { className: "filter-row", children: [_jsx("span", { className: "eyebrow", children: t.language }), _jsx("button", { type: "button", className: locale === 'zh-CN' ? 'filter-button active' : 'filter-button', onClick: () => setLocale('zh-CN'), children: "\u4E2D\u6587" }), _jsx("button", { type: "button", className: locale === 'en-US' ? 'filter-button active' : 'filter-button', onClick: () => setLocale('en-US'), children: "EN" })] }), _jsx("nav", { className: "nav-list", children: navItems.map(({ key, label }) => (_jsx("button", { type: "button", className: active === key ? 'nav-item active' : 'nav-item', onClick: () => setActive(key), children: label }, key))) }), _jsxs("section", { className: "login-card", children: [_jsx("span", { className: "chip", children: "Google SSO" }), _jsx("p", { children: t.ssoDesc }), _jsxs("p", { children: [authUser.name, " (", authUser.role, ")"] }), _jsx("p", { children: authUser.email }), _jsx("button", { type: "button", className: "filter-button", onClick: () => void handleLogout(), children: t.logout }), _jsx("div", { className: "role-grid", children: Object.entries(bootstrap.permissions).map(([role, permissions]) => (_jsxs("div", { className: "role-card", children: [_jsx("strong", { children: role }), _jsxs("span", { children: [permissions.length, t.permissionsSuffix] })] }, role))) }), authMessage ? _jsx("p", { className: "submit-message", children: authMessage }) : null] })] }), _jsxs("main", { className: "content", children: [_jsxs("header", { className: "hero", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: t.heroEyebrow }), _jsx("h2", { children: t.title })] }), _jsx("div", { className: "hero-badges", children: bootstrap.system.infra.map((item) => (_jsx("span", { className: "badge", children: item }, item))) })] }), active === 'overview' && (_jsxs("section", { className: "panel-stack", children: [_jsxs("div", { className: "metric-grid", children: [_jsxs("article", { className: "metric-card accent-orange", children: [_jsx("span", { children: t.metricWaybills }), _jsx("strong", { children: dashboard.metrics.waybillCount }), _jsx("p", { children: t.metricWaybillsDesc })] }), _jsxs("article", { className: "metric-card accent-blue", children: [_jsx("span", { children: t.metricRevenue }), _jsx("strong", { children: money(dashboard.metrics.revenue, locale) }), _jsx("p", { children: t.metricRevenueDesc })] }), _jsxs("article", { className: "metric-card accent-green", children: [_jsx("span", { children: t.metricProfit }), _jsx("strong", { children: money(dashboard.metrics.carrierGrossProfit, locale) }), _jsx("p", { children: t.metricProfitDesc })] }), _jsxs("article", { className: "metric-card accent-red", children: [_jsx("span", { children: t.metricSignRate }), _jsxs("strong", { children: [Math.round(dashboard.metrics.onTimeSignRate * 100), "%"] }), _jsx("p", { children: t.metricSignRateDesc })] })] }), _jsxs("div", { className: "two-column", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.recentWaybills }), _jsx("span", { children: t.recentWaybillsSub })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.waybillNo }), _jsx("th", { children: t.goods }), _jsx("th", { children: t.status }), _jsx("th", { children: t.amount }), _jsx("th", { children: t.shard })] }) }), _jsx("tbody", { children: dashboard.waybills.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.waybillNo }), _jsx("td", { children: item.goodsName }), _jsx("td", { children: translateStatus(item.status) }), _jsx("td", { children: money(item.totalAmount, locale) }), _jsx("td", { children: item.shardTable })] }, item.id))) })] })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.warningTitle }), _jsx("span", { children: t.warningSub })] }), _jsx("div", { className: "warning-list", children: dashboard.warnings.map((warning) => (_jsxs("article", { className: `warning-item ${warning.status.toLowerCase()}`, children: [_jsx("strong", { children: warning.entityName }), _jsx("span", { children: warning.documentName }), _jsxs("p", { children: [warning.expiryDate, " / ", translateStatus(warning.status)] })] }, warning.entityId + warning.documentName))) })] })] })] })), active === 'waybills' && (_jsxs("section", { className: "panel-stack", children: [_jsxs("div", { className: "two-column wide-left", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.createWaybillTitle }), _jsx("span", { children: t.createWaybillHint })] }), _jsxs("form", { className: "form-grid", onSubmit: handleCreateWaybill, children: [[
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
                                                    ].map(([label, field]) => (_jsxs("label", { children: [_jsx("span", { children: label }), field === 'shipperId' ? (_jsx("select", { value: draft.shipperId, onChange: (event) => setDraft((current) => ({
                                                                    ...current,
                                                                    shipperId: event.target.value,
                                                                })), children: bootstrap.references.shippers.map((item) => (_jsxs("option", { value: item.id, children: [item.id, " / ", item.name] }, item.id))) })) : field === 'carrierId' ? (_jsx("select", { value: draft.carrierId, onChange: (event) => setDraft((current) => ({
                                                                    ...current,
                                                                    carrierId: event.target.value,
                                                                })), children: bootstrap.references.carriers.map((item) => (_jsxs("option", { value: item.id, children: [item.id, " / ", item.name] }, item.id))) })) : field === 'vehicleId' ? (_jsx("select", { value: draft.vehicleId, onChange: (event) => setDraft((current) => ({
                                                                    ...current,
                                                                    vehicleId: event.target.value,
                                                                })), children: bootstrap.references.vehicles.map((item) => (_jsxs("option", { value: item.id, children: [item.id, " / ", item.plateNumber, " / ", item.truckType] }, item.id))) })) : (_jsx("input", { value: String(draft[field]), onChange: (event) => setDraft((current) => ({
                                                                    ...current,
                                                                    [field]: event.target.value,
                                                                })) }))] }, field))), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('waybill:create'), children: t.createButton }), _jsx("button", { className: "filter-button", type: "button", onClick: () => void handleQuoteWaybill(), disabled: !can('waybill:create'), children: t.actionQuote }), submitMessage ? _jsx("p", { className: "submit-message", children: submitMessage }) : null] })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.waybillListTitle }), _jsx("span", { children: t.waybillListHint })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.waybillNo }), _jsx("th", { children: t.status }), _jsx("th", { children: t.goods }), _jsx("th", { children: t.fieldMileage }), _jsx("th", { children: t.totalFee }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: pagedWaybills.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.waybillNo }), _jsx("td", { children: translateStatus(item.status) }), _jsx("td", { children: item.goodsName }), _jsx("td", { children: item.mileageKm }), _jsx("td", { children: money(item.totalAmount, locale) }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "filter-button", onClick: () => void handleSign(item), disabled: actionBusyId !== null || !can('waybill:transition'), children: t.actionSign }), _jsx("button", { type: "button", className: "filter-button", onClick: () => void handleUploadPod(item), disabled: actionBusyId !== null || !can('pod:upload'), children: t.actionUploadPod }), _jsx("button", { type: "button", className: "filter-button", onClick: () => void handleDuplicateSignTest(item), disabled: actionBusyId !== null || !can('waybill:transition'), children: t.actionDupSignTest }), _jsx("button", { type: "button", className: "filter-button", onClick: () => void handleDuplicatePodTest(item), disabled: actionBusyId !== null || !can('pod:upload'), children: t.actionDupPodTest })] })] }, item.id))) })] }), _jsxs("div", { className: "pagination-row", children: [_jsx("span", { children: waybillPageSummary }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { type: "button", className: "filter-button", onClick: () => setWaybillPage((current) => Math.max(1, current - 1)), disabled: waybillPage <= 1, children: t.pagePrev }), _jsx("button", { type: "button", className: "filter-button", onClick: () => setWaybillPage((current) => Math.min(waybillPageCount, current + 1)), disabled: waybillPage >= waybillPageCount, children: t.pageNext })] })] }), actionMessage ? _jsx("p", { className: "submit-message", children: actionMessage }) : null] })] }), renderImportSection()] })), active === 'import' && renderImportSection(), active === 'warnings' && (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.alertsTitle }), _jsx("span", { children: t.alertsHint })] }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { type: "button", className: warningFilter === 'ALL' ? 'filter-button active' : 'filter-button', onClick: () => setWarningFilter('ALL'), children: t.filterAll }), _jsx("button", { type: "button", className: warningFilter === 'EXPIRED' ? 'filter-button active' : 'filter-button', onClick: () => setWarningFilter('EXPIRED'), children: t.filterExpired })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.fieldVehicle }), _jsx("th", { children: t.vehicleCapacity }), _jsx("th", { children: t.vehicleVolume }), _jsx("th", { children: t.roadPermit }), _jsx("th", { children: t.driverLicenseExpiry }), _jsx("th", { children: t.status })] }) }), _jsx("tbody", { children: warningRows
                                            .filter((item) => warningFilter === 'EXPIRED'
                                            ? item.vehicleWarning?.status === 'EXPIRED' || item.driverWarning?.status === 'EXPIRED'
                                            : true)
                                            .map((row) => {
                                            const roadPermitStatusText = formatWarningStatusText(row.vehicleWarning, t, translateStatus);
                                            const driverLicenseStatusText = formatWarningStatusText(row.driverWarning, t, translateStatus);
                                            const rowHasAlert = isAlertWarningStatus(row.vehicleWarning?.status) || isAlertWarningStatus(row.driverWarning?.status);
                                            const roadPermitAlert = isAlertWarningStatus(row.vehicleWarning?.status);
                                            const driverAlert = isAlertWarningStatus(row.driverWarning?.status);
                                            const roadPermitInvalid = row.vehicleWarning?.status === 'INVALID';
                                            const driverInvalid = row.driverWarning?.status === 'INVALID';
                                            return (_jsxs("tr", { className: rowHasAlert ? 'warning-row-red' : undefined, children: [_jsx("td", { children: row.plateNumber }), _jsx("td", { children: row.maxWeightKg }), _jsx("td", { children: row.maxVolumeM3 }), _jsx("td", { children: _jsxs("span", { className: roadPermitAlert ? 'warning-status-text alert' : roadPermitInvalid ? 'warning-status-text invalid' : 'warning-status-text', children: [row.roadPermitExpiry, " / ", roadPermitStatusText] }) }), _jsx("td", { children: _jsxs("span", { className: driverAlert ? 'warning-status-text alert' : driverInvalid ? 'warning-status-text invalid' : 'warning-status-text', children: [row.driver?.licenseExpiry ?? '-', " / ", driverLicenseStatusText] }) }), _jsxs("td", { children: [_jsxs("div", { className: roadPermitAlert ? 'warning-status-text alert' : roadPermitInvalid ? 'warning-status-text invalid' : 'warning-status-text', children: [t.roadPermit, ": ", roadPermitStatusText] }), _jsxs("div", { className: driverAlert ? 'warning-status-text alert' : driverInvalid ? 'warning-status-text invalid' : 'warning-status-text', children: [t.driverLicenseExpiry, ": ", driverLicenseStatusText] })] })] }, row.id));
                                        }) })] })] })), active === 'archives' && (_jsx("section", { className: "panel-stack", children: _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.archivesTitle }), _jsx("span", { children: t.archivesHint })] }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { type: "button", className: archiveTab === 'shippers' ? 'filter-button active' : 'filter-button', onClick: () => setArchiveTab('shippers'), children: t.tabShippers }), _jsx("button", { type: "button", className: archiveTab === 'carriers' ? 'filter-button active' : 'filter-button', onClick: () => setArchiveTab('carriers'), children: t.tabCarriers }), _jsx("button", { type: "button", className: archiveTab === 'vehicles' ? 'filter-button active' : 'filter-button', onClick: () => setArchiveTab('vehicles'), children: t.tabVehicles }), _jsx("button", { type: "button", className: archiveTab === 'drivers' ? 'filter-button active' : 'filter-button', onClick: () => setArchiveTab('drivers'), children: t.tabDrivers })] }), archiveMessage ? _jsx("p", { className: "submit-message", children: archiveMessage }) : null, archiveTab === 'shippers' && (_jsxs(_Fragment, { children: [_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.colId }), _jsx("th", { children: t.colCode }), _jsx("th", { children: t.colName }), _jsx("th", { children: t.colContact }), _jsx("th", { children: t.colPhone }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: bootstrap.references.shippers.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.id }), _jsx("td", { children: item.code }), _jsx("td", { children: item.name }), _jsx("td", { children: item.contactName }), _jsx("td", { children: item.phone }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => {
                                                                            setEditingShipperId(item.id);
                                                                            setShipperDraft({
                                                                                code: item.code,
                                                                                name: item.name,
                                                                                contactName: item.contactName,
                                                                                phone: item.phone,
                                                                            });
                                                                            setArchiveMessage('');
                                                                        }, children: t.actionEdit }), _jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => void handleDelete('shipper', item.id), children: t.actionDelete })] })] }, item.id))) })] }), _jsxs("form", { className: "form-grid", onSubmit: handleSaveShipper, children: [_jsxs("label", { children: [_jsx("span", { children: t.formCode }), _jsx("input", { value: shipperDraft.code, onChange: (e) => setShipperDraft((c) => ({ ...c, code: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formName }), _jsx("input", { value: shipperDraft.name, onChange: (e) => setShipperDraft((c) => ({ ...c, name: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formContactName }), _jsx("input", { value: shipperDraft.contactName, onChange: (e) => setShipperDraft((c) => ({ ...c, contactName: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formPhone }), _jsx("input", { value: shipperDraft.phone, onChange: (e) => setShipperDraft((c) => ({ ...c, phone: e.target.value })) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('master:manage'), children: editingShipperId ? t.actionSave : t.actionCreate }), editingShipperId ? (_jsx("button", { type: "button", className: "filter-button", onClick: resetArchiveDrafts, children: t.actionCancelEdit })) : null] })] })), archiveTab === 'carriers' && (_jsxs(_Fragment, { children: [_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.colId }), _jsx("th", { children: t.colCode }), _jsx("th", { children: t.colName }), _jsx("th", { children: t.colContact }), _jsx("th", { children: t.colPhone }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: bootstrap.references.carriers.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.id }), _jsx("td", { children: item.code }), _jsx("td", { children: item.name }), _jsx("td", { children: item.contactName }), _jsx("td", { children: item.phone }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => {
                                                                            setEditingCarrierId(item.id);
                                                                            setCarrierDraft({
                                                                                code: item.code,
                                                                                name: item.name,
                                                                                contactName: item.contactName,
                                                                                phone: item.phone,
                                                                            });
                                                                            setArchiveMessage('');
                                                                        }, children: t.actionEdit }), _jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => void handleDelete('carrier', item.id), children: t.actionDelete })] })] }, item.id))) })] }), _jsxs("form", { className: "form-grid", onSubmit: handleSaveCarrier, children: [_jsxs("label", { children: [_jsx("span", { children: t.formCode }), _jsx("input", { value: carrierDraft.code, onChange: (e) => setCarrierDraft((c) => ({ ...c, code: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formName }), _jsx("input", { value: carrierDraft.name, onChange: (e) => setCarrierDraft((c) => ({ ...c, name: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formContactName }), _jsx("input", { value: carrierDraft.contactName, onChange: (e) => setCarrierDraft((c) => ({ ...c, contactName: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formPhone }), _jsx("input", { value: carrierDraft.phone, onChange: (e) => setCarrierDraft((c) => ({ ...c, phone: e.target.value })) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('master:manage'), children: editingCarrierId ? t.actionSave : t.actionCreate }), editingCarrierId ? (_jsx("button", { type: "button", className: "filter-button", onClick: resetArchiveDrafts, children: t.actionCancelEdit })) : null] })] })), archiveTab === 'vehicles' && (_jsxs(_Fragment, { children: [_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.colId }), _jsx("th", { children: t.colPlateNo }), _jsx("th", { children: t.truckType }), _jsx("th", { children: t.vehicleCapacity }), _jsx("th", { children: t.vehicleVolume }), _jsx("th", { children: t.colDriver }), _jsx("th", { children: t.colExpiry }), _jsx("th", { children: t.status }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: bootstrap.references.vehicles.map((item) => {
                                                        const warning = warnings.find((w) => w.entityId === item.id && w.entityType === 'VEHICLE');
                                                        const driver = bootstrap.references.drivers.find((d) => d.id === item.assignedDriverId);
                                                        return (_jsxs("tr", { children: [_jsx("td", { children: item.id }), _jsx("td", { children: item.plateNumber }), _jsx("td", { children: item.truckType }), _jsx("td", { children: item.maxWeightKg }), _jsx("td", { children: item.maxVolumeM3 }), _jsx("td", { children: driver?.name ?? '-' }), _jsx("td", { children: item.roadPermitExpiry }), _jsx("td", { children: warning ? translateStatus(warning.status) : t.normal }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => {
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
                                                                            }, children: t.actionEdit }), _jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => void handleDelete('vehicle', item.id), children: t.actionDelete })] })] }, item.id));
                                                    }) })] }), _jsxs("form", { className: "form-grid", onSubmit: handleSaveVehicle, children: [_jsxs("label", { children: [_jsx("span", { children: t.formPlateNo }), _jsx("input", { value: vehicleDraft.plateNumber, onChange: (e) => setVehicleDraft((c) => ({ ...c, plateNumber: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.truckType }), _jsxs("select", { value: vehicleDraft.truckType, onChange: (e) => setVehicleDraft((c) => ({ ...c, truckType: e.target.value })), children: [_jsx("option", { value: "4.2M", children: "4.2M" }), _jsx("option", { value: "6.8M", children: "6.8M" }), _jsx("option", { value: "9.6M", children: "9.6M" }), _jsx("option", { value: "17.5M", children: "17.5M" })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.vehicleCapacity }), _jsx("input", { value: String(vehicleDraft.maxWeightKg), onChange: (e) => setVehicleDraft((c) => ({ ...c, maxWeightKg: Number(e.target.value) })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.vehicleVolume }), _jsx("input", { value: String(vehicleDraft.maxVolumeM3), onChange: (e) => setVehicleDraft((c) => ({ ...c, maxVolumeM3: Number(e.target.value) })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formRoadPermitExpiry }), _jsx("input", { value: vehicleDraft.roadPermitExpiry, onChange: (e) => setVehicleDraft((c) => ({ ...c, roadPermitExpiry: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formAssignedDriver }), _jsx("select", { value: vehicleDraft.assignedDriverId, onChange: (e) => setVehicleDraft((c) => ({ ...c, assignedDriverId: e.target.value })), children: bootstrap.references.drivers.map((driver) => (_jsxs("option", { value: driver.id, children: [driver.id, " / ", driver.name] }, driver.id))) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('master:manage'), children: editingVehicleId ? t.actionSave : t.actionCreate }), editingVehicleId ? (_jsx("button", { type: "button", className: "filter-button", onClick: resetArchiveDrafts, children: t.actionCancelEdit })) : null] })] })), archiveTab === 'drivers' && (_jsxs(_Fragment, { children: [_jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.colId }), _jsx("th", { children: t.formDriverName }), _jsx("th", { children: t.colPhone }), _jsx("th", { children: t.colLicenseNo }), _jsx("th", { children: t.colExpiry }), _jsx("th", { children: t.status }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: bootstrap.references.drivers.map((item) => {
                                                        const warning = warnings.find((w) => w.entityId === item.id && w.entityType === 'DRIVER');
                                                        return (_jsxs("tr", { children: [_jsx("td", { children: item.id }), _jsx("td", { children: item.name }), _jsx("td", { children: item.phone }), _jsx("td", { children: item.licenseNumber }), _jsx("td", { children: item.licenseExpiry }), _jsx("td", { children: warning ? translateStatus(warning.status) : t.normal }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => {
                                                                                setEditingDriverId(item.id);
                                                                                setDriverDraft({
                                                                                    name: item.name,
                                                                                    phone: item.phone,
                                                                                    licenseNumber: item.licenseNumber,
                                                                                    licenseExpiry: item.licenseExpiry,
                                                                                });
                                                                                setArchiveMessage('');
                                                                            }, children: t.actionEdit }), _jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => void handleDelete('driver', item.id), children: t.actionDelete })] })] }, item.id));
                                                    }) })] }), _jsxs("form", { className: "form-grid", onSubmit: handleSaveDriver, children: [_jsxs("label", { children: [_jsx("span", { children: t.formDriverName }), _jsx("input", { value: driverDraft.name, onChange: (e) => setDriverDraft((c) => ({ ...c, name: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formPhone }), _jsx("input", { value: driverDraft.phone, onChange: (e) => setDriverDraft((c) => ({ ...c, phone: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formLicenseNo }), _jsx("input", { value: driverDraft.licenseNumber, onChange: (e) => setDriverDraft((c) => ({ ...c, licenseNumber: e.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.formLicenseExpiry }), _jsx("input", { value: driverDraft.licenseExpiry, onChange: (e) => setDriverDraft((c) => ({ ...c, licenseExpiry: e.target.value })) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('master:manage'), children: editingDriverId ? t.actionSave : t.actionCreate }), editingDriverId ? (_jsx("button", { type: "button", className: "filter-button", onClick: resetArchiveDrafts, children: t.actionCancelEdit })) : null] })] }))] }) })), active === 'settlement' && (_jsxs("section", { className: "panel-stack", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.settlementTitle }), _jsx("span", { children: t.settlementHint })] }), _jsx("p", { children: t.settlementReloadHint }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.shipper }), _jsx("th", { children: t.truckType }), _jsx("th", { children: t.mileageRange }), _jsx("th", { children: t.unitPrice }), _jsx("th", { children: t.loadingFee }), _jsx("th", { children: t.insuranceRate }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: pricingRuleDrafts.map((rule, index) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("select", { value: rule.shipperId, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, shipperId: event.target.value } : item)), children: bootstrap.references.shippers.map((item) => (_jsx("option", { value: item.id, children: item.id }, `pricing-shipper-${item.id}`))) }) }), _jsx("td", { children: _jsxs("select", { value: rule.truckType, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, truckType: event.target.value } : item)), children: [_jsx("option", { value: "4.2M", children: "4.2M" }), _jsx("option", { value: "6.8M", children: "6.8M" }), _jsx("option", { value: "9.6M", children: "9.6M" }), _jsx("option", { value: "17.5M", children: "17.5M" })] }) }), _jsx("td", { children: _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }, children: [_jsx("input", { type: "number", step: "1", value: rule.minMileageKm, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, minMileageKm: event.target.value } : item)) }), _jsx("input", { type: "number", step: "1", value: rule.maxMileageKm, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maxMileageKm: event.target.value } : item)) })] }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "any", value: rule.unitPricePerKm, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, unitPricePerKm: event.target.value } : item)) }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "any", value: rule.loadingFee, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, loadingFee: event.target.value } : item)) }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "any", value: rule.insuranceRate, onChange: (event) => setPricingRuleDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, insuranceRate: event.target.value } : item)) }) }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "primary-button", disabled: !can('master:manage'), onClick: () => void handleSavePricingRule(rule), children: t.actionSave }), _jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => void handleDeletePricingRule(index), style: { marginLeft: '8px' }, children: t.actionDelete })] })] }, `${rule.shipperId}-${index}`))) })] }), _jsxs("form", { className: "form-grid", onSubmit: handleCreatePricingRule, children: [_jsxs("label", { children: [_jsx("span", { children: t.shipper }), _jsx("select", { value: pricingRuleCreateDraft.shipperId, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, shipperId: event.target.value })), children: bootstrap.references.shippers.map((item) => (_jsx("option", { value: item.id, children: item.id }, `create-pricing-shipper-${item.id}`))) })] }), _jsxs("label", { children: [_jsx("span", { children: t.truckType }), _jsxs("select", { value: pricingRuleCreateDraft.truckType, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, truckType: event.target.value })), children: [_jsx("option", { value: "4.2M", children: "4.2M" }), _jsx("option", { value: "6.8M", children: "6.8M" }), _jsx("option", { value: "9.6M", children: "9.6M" }), _jsx("option", { value: "17.5M", children: "17.5M" })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.mileageRange }), _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }, children: [_jsx("input", { type: "number", step: "1", value: pricingRuleCreateDraft.minMileageKm, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, minMileageKm: event.target.value })) }), _jsx("input", { type: "number", step: "1", value: pricingRuleCreateDraft.maxMileageKm, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, maxMileageKm: event.target.value })) })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.unitPrice }), _jsx("input", { type: "number", step: "any", value: pricingRuleCreateDraft.unitPricePerKm, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, unitPricePerKm: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.loadingFee }), _jsx("input", { type: "number", step: "any", value: pricingRuleCreateDraft.loadingFee, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, loadingFee: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.insuranceRate }), _jsx("input", { type: "number", step: "any", value: pricingRuleCreateDraft.insuranceRate, onChange: (event) => setPricingRuleCreateDraft((current) => ({ ...current, insuranceRate: event.target.value })) })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('master:manage'), children: t.actionCreate })] })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.settlementEditAdjustments }), _jsx("span", { children: t.settlementHint })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.settlementCode }), _jsx("th", { children: t.settlementLabel }), _jsx("th", { children: t.settlementCategory }), _jsx("th", { children: t.settlementMode }), _jsx("th", { children: t.settlementValue }), _jsx("th", { children: t.settlementEnabled }), _jsx("th", { children: t.settlementScope }), _jsx("th", { children: t.colActions })] }) }), _jsx("tbody", { children: settlementAdjustmentDrafts.map((rule, index) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("input", { value: rule.code, onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, code: event.target.value } : item)) }) }), _jsx("td", { children: _jsx("input", { value: rule.label, onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item)) }) }), _jsx("td", { children: _jsxs("select", { value: rule.category, onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, category: event.target.value } : item)), children: [_jsx("option", { value: "LOADING", children: "LOADING" }), _jsx("option", { value: "DEDUCTION", children: "DEDUCTION" })] }) }), _jsx("td", { children: _jsxs("select", { value: rule.mode, onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, mode: event.target.value } : item)), children: [_jsx("option", { value: "FIXED", children: "FIXED" }), _jsx("option", { value: "LINE_HAUL_RATE", children: "LINE_HAUL_RATE" })] }) }), _jsx("td", { children: _jsx("input", { type: "number", step: "any", value: rule.value, onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item)) }) }), _jsx("td", { children: _jsxs("select", { value: rule.enabled ? '1' : '0', onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.value === '1' } : item)), children: [_jsx("option", { value: "1", children: "Y" }), _jsx("option", { value: "0", children: "N" })] }) }), _jsx("td", { children: _jsxs("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }, children: [_jsxs("select", { value: rule.shipperId ?? '', onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, shipperId: event.target.value || undefined } : item)), children: [_jsx("option", { value: "", children: "*" }), bootstrap.references.shippers.map((item) => (_jsx("option", { value: item.id, children: item.id }, `adj-shipper-${item.id}-${index}`)))] }), _jsxs("select", { value: rule.truckType ?? '', onChange: (event) => setSettlementAdjustmentDrafts((current) => current.map((item, itemIndex) => itemIndex === index
                                                                            ? { ...item, truckType: (event.target.value || undefined) }
                                                                            : item)), children: [_jsx("option", { value: "", children: "*" }), _jsx("option", { value: "4.2M", children: "4.2M" }), _jsx("option", { value: "6.8M", children: "6.8M" }), _jsx("option", { value: "9.6M", children: "9.6M" }), _jsx("option", { value: "17.5M", children: "17.5M" })] })] }) }), _jsxs("td", { children: [_jsx("button", { type: "button", className: "primary-button", disabled: !can('master:manage'), onClick: () => void handleSaveSettlementAdjustmentRow(rule), children: t.actionSave }), _jsx("button", { type: "button", className: "filter-button", disabled: !can('master:manage'), onClick: () => void handleDeleteSettlementAdjustment(index), style: { marginLeft: '8px' }, children: t.actionDelete })] })] }, `${rule.code}-${index}`))) })] }), _jsxs("form", { className: "form-grid", onSubmit: handleSaveSettlementAdjustment, children: [_jsxs("label", { children: [_jsx("span", { children: t.settlementCode }), _jsx("input", { value: settlementAdjustmentDraft.code, onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, code: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.settlementLabel }), _jsx("input", { value: settlementAdjustmentDraft.label, onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, label: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.settlementCategory }), _jsxs("select", { value: settlementAdjustmentDraft.category, onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, category: event.target.value })), children: [_jsx("option", { value: "LOADING", children: "LOADING" }), _jsx("option", { value: "DEDUCTION", children: "DEDUCTION" })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.settlementMode }), _jsxs("select", { value: settlementAdjustmentDraft.mode, onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, mode: event.target.value })), children: [_jsx("option", { value: "FIXED", children: "FIXED" }), _jsx("option", { value: "LINE_HAUL_RATE", children: "LINE_HAUL_RATE" })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.settlementValue }), _jsx("input", { type: "number", step: "any", value: settlementAdjustmentDraft.value, onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, value: event.target.value })) })] }), _jsxs("label", { children: [_jsx("span", { children: t.shipper }), _jsxs("select", { value: settlementAdjustmentDraft.shipperId ?? '', onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, shipperId: event.target.value || undefined })), children: [_jsx("option", { value: "", children: "*" }), bootstrap.references.shippers.map((item) => (_jsx("option", { value: item.id, children: item.id }, item.id)))] })] }), _jsxs("label", { children: [_jsx("span", { children: t.truckType }), _jsxs("select", { value: settlementAdjustmentDraft.truckType ?? '', onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, truckType: (event.target.value || undefined) })), children: [_jsx("option", { value: "", children: "*" }), _jsx("option", { value: "4.2M", children: "4.2M" }), _jsx("option", { value: "6.8M", children: "6.8M" }), _jsx("option", { value: "9.6M", children: "9.6M" }), _jsx("option", { value: "17.5M", children: "17.5M" })] })] }), _jsxs("label", { children: [_jsx("span", { children: t.settlementEnabled }), _jsxs("select", { value: settlementAdjustmentDraft.enabled ? '1' : '0', onChange: (event) => setSettlementAdjustmentDraft((current) => ({ ...current, enabled: event.target.value === '1' })), children: [_jsx("option", { value: "1", children: "Y" }), _jsx("option", { value: "0", children: "N" })] })] }), _jsx("button", { className: "primary-button", type: "submit", disabled: !can('master:manage'), children: t.actionCreate }), settlementMessage ? _jsx("p", { className: "submit-message", children: settlementMessage }) : null] })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.settlementWaybillTitle }), _jsx("span", { children: t.settlementWaybillHint })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: t.waybillNo }), _jsx("th", { children: t.status }), _jsx("th", { children: t.payableAmount }), _jsx("th", { children: t.feeDetails })] }) }), _jsx("tbody", { children: waybills.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 4, children: t.noSettlementData }) })) : (waybills.slice(0, 12).map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.waybillNo }), _jsx("td", { children: translateStatus(item.status) }), _jsxs("td", { style: { color: item.totalAmount < 0 ? '#b42318' : undefined, fontWeight: item.totalAmount < 0 ? 700 : 500 }, children: [money(item.totalAmount, locale), item.totalAmount < 0 ? ` (${t.negativePayableTag})` : ''] }), _jsx("td", { children: item.fees.map((fee) => `${fee.label}: ${money(fee.amount, locale)} (${fee.formula})`).join(' | ') })] }, `settlement-${item.id}`)))) })] })] }), _jsxs("section", { className: "card timeline-card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.timelineTitle }), _jsx("span", { children: t.timelineHint })] }), _jsx("div", { className: "timeline", children: bootstrap.statusFlow.map((node) => (_jsxs("div", { className: "timeline-node", children: [_jsx("strong", { children: translateStatus(node.status) }), _jsx("span", { children: node.next.length > 0 ? node.next.map((item) => translateStatus(item)).join(' / ') : t.endStatus })] }, node.status))) })] })] })), active === 'architecture' && (_jsxs("section", { className: "panel-stack", children: [_jsxs("section", { className: "card architecture-board", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.architectureTitle }), _jsx("span", { children: t.architectureHint })] }), _jsxs("div", { className: "arch-grid", children: [_jsxs("article", { children: [_jsx("strong", { children: "Web / Nginx" }), _jsx("p", { children: t.archWeb })] }), _jsxs("article", { children: [_jsx("strong", { children: "App Servers" }), _jsx("p", { children: t.archApp })] }), _jsxs("article", { children: [_jsx("strong", { children: "RabbitMQ" }), _jsx("p", { children: t.archMq })] }), _jsxs("article", { children: [_jsx("strong", { children: "MySQL Shards" }), _jsx("p", { children: t.archDb })] }), _jsxs("article", { children: [_jsx("strong", { children: "Redis" }), _jsx("p", { children: t.archRedis })] }), _jsxs("article", { children: [_jsx("strong", { children: "Observability" }), _jsx("p", { children: t.archObs })] })] })] }), _jsxs("section", { className: "card cache-board", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: t.cacheBoardTitle }), _jsx("span", { children: t.cacheBoardHint })] }), cacheScenarios ? (_jsxs("div", { className: "cache-board-grid", children: [_jsxs("article", { children: [_jsx("strong", { children: t.cacheArchiveCoverage }), _jsxs("p", { children: ["shipper:", cacheScenarios.scenarios.archiveDetailCache.shipperDetailCount, " / carrier:", ' ', cacheScenarios.scenarios.archiveDetailCache.carrierDetailCount, " / vehicle:", ' ', cacheScenarios.scenarios.archiveDetailCache.vehicleDetailCount, " / driver:", ' ', cacheScenarios.scenarios.archiveDetailCache.driverDetailCount] })] }), _jsxs("article", { children: [_jsx("strong", { children: t.cacheLockCoverage }), _jsxs("p", { children: [cacheScenarios.scenarios.distributedLockCache.keyPattern, " =", ' ', cacheScenarios.scenarios.distributedLockCache.keyCount] })] }), _jsxs("article", { children: [_jsx("strong", { children: t.cacheIdemCoverage }), _jsxs("p", { children: [cacheScenarios.scenarios.idempotencyCache.keyPattern, " =", ' ', cacheScenarios.scenarios.idempotencyCache.keyCount] })] }), _jsxs("article", { children: [_jsx("strong", { children: t.cacheDashboardCoverage }), _jsxs("p", { children: ["dashboard:", cacheScenarios.scenarios.dashboardHotCache.dashboardCount, " / recent:", ' ', cacheScenarios.scenarios.dashboardHotCache.waybillRecentCount, " / bootstrap:", ' ', cacheScenarios.scenarios.dashboardHotCache.bootstrapCount] })] }), _jsxs("article", { className: "cache-wide", children: [_jsx("strong", { children: t.cacheSampleKeys }), _jsx("p", { children: cacheScenarios.samples.archiveDetailKeys.join(' | ') || '-' })] }), _jsxs("article", { className: "cache-wide", children: [_jsx("strong", { children: t.cachePolicy }), _jsxs("p", { children: [t.cacheTtl, ": archive=", cacheScenarios.policy.ttlSeconds.archiveDetail, "s, null=", cacheScenarios.policy.ttlSeconds.archiveNullValue, "s, dashboard=", cacheScenarios.policy.ttlSeconds.dashboard, "s, recent=", cacheScenarios.policy.ttlSeconds.waybillRecent, "s, idempotency=", cacheScenarios.policy.ttlSeconds.idempotencySnapshot, "s"] }), _jsxs("p", { children: [t.cachePenetration, ": ", cacheScenarios.policy.antiPenetration] }), _jsxs("p", { children: [t.cacheBreakdown, ": ", cacheScenarios.policy.antiBreakdown] })] })] })) : (_jsx("p", { children: locale === 'en-US' ? 'Cache scenarios are loading...' : '缓存场景加载中...' }))] })] }))] })] }));
}
