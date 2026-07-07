import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { createWaybill, fetchBootstrap, fetchDashboard, fetchWarnings, fetchWaybills } from './api';
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
function money(value) {
    return new Intl.NumberFormat('zh-CN', {
        style: 'currency',
        currency: 'CNY',
        minimumFractionDigits: 2,
    }).format(value);
}
export function App() {
    const [active, setActive] = useState('overview');
    const [bootstrap, setBootstrap] = useState(null);
    const [dashboard, setDashboard] = useState(null);
    const [waybills, setWaybills] = useState([]);
    const [warnings, setWarnings] = useState([]);
    const [warningFilter, setWarningFilter] = useState('ALL');
    const [draft, setDraft] = useState(defaultDraft);
    const [submitMessage, setSubmitMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                setLoadError('');
                const [bootstrapData, dashboardData, waybillData, warningData] = await Promise.all([
                    fetchBootstrap(),
                    fetchDashboard(),
                    fetchWaybills(),
                    fetchWarnings(),
                ]);
                if (!cancelled) {
                    setBootstrap(bootstrapData);
                    setDashboard(dashboardData);
                    setWaybills(waybillData.items);
                    setWarnings(warningData.items);
                }
            }
            catch (error) {
                if (!cancelled) {
                    setLoadError(error instanceof Error ? error.message : '加载失败，请稍后重试');
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
    }, []);
    async function handleCreateWaybill(event) {
        event.preventDefault();
        try {
            const record = await createWaybill({
                ...draft,
                mileageKm: Number(draft.mileageKm),
                weightKg: Number(draft.weightKg),
                volumeM3: Number(draft.volumeM3),
                extraLoadingFee: Number(draft.extraLoadingFee),
                subsidy: Number(draft.subsidy),
                deduction: Number(draft.deduction),
            });
            setWaybills((current) => [record, ...current]);
            setSubmitMessage(`已创建运单 ${record.waybillNo}，总运费 ${money(record.totalAmount)}`);
        }
        catch (error) {
            setSubmitMessage(error instanceof Error ? error.message : '创建失败');
        }
    }
    if (loading || !bootstrap || !dashboard) {
        if (!loading && loadError) {
            return _jsxs("div", { className: "loading-shell", children: ["\u52A0\u8F7D\u5931\u8D25\uFF1A", loadError] });
        }
        return _jsx("div", { className: "loading-shell", children: "Loading internal admin console..." });
    }
    return (_jsxs("div", { className: "shell", children: [_jsxs("aside", { className: "sidebar", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Internal Logistics Suite" }), _jsx("h1", { children: "\u8FD0\u5355 & \u7ED3\u7B97\u7BA1\u7406\u540E\u53F0" }), _jsx("p", { className: "sidebar-copy", children: "\u9762\u5411\u8D27\u4E3B\u3001\u627F\u8FD0\u5546\u3001\u7BA1\u7406\u5458\u7684\u591A\u8BED\u8A00\u5185\u90E8\u63A7\u5236\u53F0\uFF0C\u8986\u76D6\u8FD0\u5355\u3001\u7ED3\u7B97\u3001\u6863\u6848\u9884\u8B66\u4E0E\u5206\u5E03\u5F0F\u67B6\u6784\u6CBB\u7406\u3002" })] }), _jsx("nav", { className: "nav-list", children: [
                            ['overview', '总览 Dashboard'],
                            ['waybills', '运单中心 Waybills'],
                            ['warnings', '证件预警 Alerts'],
                            ['settlement', '结算规则 Settlement'],
                            ['architecture', '架构方案 Architecture'],
                        ].map(([key, label]) => (_jsx("button", { type: "button", className: active === key ? 'nav-item active' : 'nav-item', onClick: () => setActive(key), children: label }, key))) }), _jsxs("section", { className: "login-card", children: [_jsx("span", { className: "chip", children: "Google SSO" }), _jsx("p", { children: "\u652F\u6301 Google OAuth2 \u767B\u5F55\u4E0E RBAC \u6743\u9650\u63A7\u5236\u3002" }), _jsx("div", { className: "role-grid", children: Object.entries(bootstrap.permissions).map(([role, permissions]) => (_jsxs("div", { className: "role-card", children: [_jsx("strong", { children: role }), _jsxs("span", { children: [permissions.length, " permissions"] })] }, role))) })] })] }), _jsxs("main", { className: "content", children: [_jsxs("header", { className: "hero", children: [_jsxs("div", { children: [_jsx("p", { className: "eyebrow", children: "Bilingual Admin Experience" }), _jsx("h2", { children: bootstrap.system.name })] }), _jsx("div", { className: "hero-badges", children: bootstrap.system.infra.map((item) => (_jsx("span", { className: "badge", children: item }, item))) })] }), active === 'overview' && (_jsxs("section", { className: "panel-stack", children: [_jsxs("div", { className: "metric-grid", children: [_jsxs("article", { className: "metric-card accent-orange", children: [_jsx("span", { children: "\u8FD0\u5355\u91CF" }), _jsx("strong", { children: dashboard.metrics.waybillCount }), _jsx("p", { children: "\u652F\u6301\u9AD8\u5E76\u53D1\u5F00\u5355\u4E0E\u5206\u8868\u6269\u5C55" })] }), _jsxs("article", { className: "metric-card accent-blue", children: [_jsx("span", { children: "\u8425\u6536 Revenue" }), _jsx("strong", { children: money(dashboard.metrics.revenue) }), _jsx("p", { children: "\u8D39\u7528\u660E\u7EC6\u53EF\u8FFD\u6EAF\uFF0C\u652F\u6301\u8D1F\u91D1\u989D" })] }), _jsxs("article", { className: "metric-card accent-green", children: [_jsx("span", { children: "\u627F\u8FD0\u5546\u6BDB\u5229" }), _jsx("strong", { children: money(dashboard.metrics.carrierGrossProfit) }), _jsx("p", { children: "\u62A5\u8868\u9875\u7F13\u5B58\u70ED\u70B9\u7EDF\u8BA1\u7ED3\u679C" })] }), _jsxs("article", { className: "metric-card accent-red", children: [_jsx("span", { children: "\u7B7E\u6536\u7387" }), _jsxs("strong", { children: [Math.round(dashboard.metrics.onTimeSignRate * 100), "%"] }), _jsx("p", { children: "\u5E42\u7B49\u7B7E\u6536\u4E0E\u56DE\u5355\u4E0A\u4F20\u4FDD\u62A4" })] })] }), _jsxs("div", { className: "two-column", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u6700\u8FD1\u8FD0\u5355" }), _jsx("span", { children: "Recent waybills" })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u8FD0\u5355\u53F7" }), _jsx("th", { children: "\u8D27\u7269" }), _jsx("th", { children: "\u72B6\u6001" }), _jsx("th", { children: "\u91D1\u989D" }), _jsx("th", { children: "\u5206\u8868" })] }) }), _jsx("tbody", { children: dashboard.waybills.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.waybillNo }), _jsx("td", { children: item.goodsName }), _jsx("td", { children: item.status }), _jsx("td", { children: money(item.totalAmount) }), _jsx("td", { children: item.shardTable })] }, item.id))) })] })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u8BC1\u4EF6\u9884\u8B66" }), _jsx("span", { children: "Driver & vehicle alerts" })] }), _jsx("div", { className: "warning-list", children: dashboard.warnings.map((warning) => (_jsxs("article", { className: `warning-item ${warning.status.toLowerCase()}`, children: [_jsx("strong", { children: warning.entityName }), _jsx("span", { children: warning.documentName }), _jsxs("p", { children: [warning.expiryDate, " / ", warning.status] })] }, warning.entityId + warning.documentName))) })] })] })] })), active === 'waybills' && (_jsx("section", { className: "panel-stack", children: _jsxs("div", { className: "two-column wide-left", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u65B0\u5EFA\u8FD0\u5355" }), _jsx("span", { children: "Capacity guard + fee details" })] }), _jsxs("form", { className: "form-grid", onSubmit: handleCreateWaybill, children: [[
                                                    ['货主', 'shipperId'],
                                                    ['承运商', 'carrierId'],
                                                    ['车辆', 'vehicleId'],
                                                    ['里程 km', 'mileageKm'],
                                                    ['重量 kg', 'weightKg'],
                                                    ['体积 m3', 'volumeM3'],
                                                    ['货物名称', 'goodsName'],
                                                    ['附加装卸费', 'extraLoadingFee'],
                                                    ['补贴', 'subsidy'],
                                                    ['扣款', 'deduction'],
                                                ].map(([label, field]) => (_jsxs("label", { children: [_jsx("span", { children: label }), _jsx("input", { value: String(draft[field]), onChange: (event) => setDraft((current) => ({
                                                                ...current,
                                                                [field]: event.target.value,
                                                            })) })] }, field))), _jsx("button", { className: "primary-button", type: "submit", children: "\u521B\u5EFA\u8FD0\u5355" }), submitMessage ? _jsx("p", { className: "submit-message", children: submitMessage }) : null] })] }), _jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u8FD0\u5355\u5217\u8868" }), _jsx("span", { children: "Idempotent operations and shard routing" })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u8FD0\u5355\u53F7" }), _jsx("th", { children: "\u72B6\u6001" }), _jsx("th", { children: "\u8D27\u7269" }), _jsx("th", { children: "\u91CC\u7A0B" }), _jsx("th", { children: "\u603B\u8D39\u7528" })] }) }), _jsx("tbody", { children: waybills.map((item) => (_jsxs("tr", { children: [_jsx("td", { children: item.waybillNo }), _jsx("td", { children: item.status }), _jsx("td", { children: item.goodsName }), _jsx("td", { children: item.mileageKm }), _jsx("td", { children: money(item.totalAmount) })] }, item.id))) })] })] })] }) })), active === 'warnings' && (_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u6863\u6848\u4E0E\u8BC1\u4EF6\u9884\u8B66" }), _jsx("span", { children: "\u7EA2\u8272\u6807\u8BB0\u8FC7\u671F/\u4E34\u671F\u6570\u636E\uFF0C\u975E\u6CD5\u65E5\u671F\u4E0D\u963B\u585E\u9875\u9762" })] }), _jsxs("div", { className: "filter-row", children: [_jsx("button", { type: "button", className: warningFilter === 'ALL' ? 'filter-button active' : 'filter-button', onClick: () => setWarningFilter('ALL'), children: "\u5168\u90E8" }), _jsx("button", { type: "button", className: warningFilter === 'EXPIRED' ? 'filter-button active' : 'filter-button', onClick: () => setWarningFilter('EXPIRED'), children: "\u4EC5\u8BC1\u4EF6\u8FC7\u671F" })] }), _jsx("div", { className: "warning-list", children: warnings
                                    .filter((item) => (warningFilter === 'EXPIRED' ? item.status === 'EXPIRED' : true))
                                    .map((warning) => (_jsxs("article", { className: `warning-item ${warning.status.toLowerCase()}`, children: [_jsx("strong", { children: warning.entityName }), _jsx("span", { children: warning.documentName }), _jsxs("p", { children: [warning.expiryDate, " / ", warning.status, warning.daysRemaining !== null ? ` / 剩余${warning.daysRemaining}天` : ' / 非法日期'] })] }, `${warning.entityId}-${warning.documentName}`))) }), _jsxs("div", { className: "reference-grid", children: [bootstrap.references.vehicles.map((vehicle) => (_jsxs("article", { className: "reference-card", children: [_jsx("strong", { children: vehicle.plateNumber }), _jsx("span", { children: vehicle.truckType }), _jsxs("p", { children: ["\u8F7D\u91CD ", vehicle.maxWeightKg, "kg / \u4F53\u79EF ", vehicle.maxVolumeM3, "m3"] }), _jsxs("p", { children: ["\u9053\u8DEF\u8BB8\u53EF\u8BC1: ", vehicle.roadPermitExpiry] })] }, vehicle.id))), bootstrap.references.drivers.map((driver) => (_jsxs("article", { className: "reference-card", children: [_jsx("strong", { children: driver.name }), _jsx("span", { children: driver.licenseNumber }), _jsx("p", { children: driver.phone }), _jsxs("p", { children: ["\u9A7E\u9A76\u8BC1\u5230\u671F: ", driver.licenseExpiry] })] }, driver.id)))] })] })), active === 'settlement' && (_jsxs("section", { className: "panel-stack", children: [_jsxs("section", { className: "card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u7ED3\u7B97\u89C4\u5219\u914D\u7F6E\u5316" }), _jsx("span", { children: "Change config, not core flow" })] }), _jsxs("table", { className: "data-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u8D27\u4E3B" }), _jsx("th", { children: "\u8F66\u578B" }), _jsx("th", { children: "\u91CC\u7A0B\u533A\u95F4" }), _jsx("th", { children: "\u5355\u4EF7" }), _jsx("th", { children: "\u88C5\u5378\u8D39" }), _jsx("th", { children: "\u4FDD\u8D39\u7387" })] }) }), _jsx("tbody", { children: bootstrap.references.pricingRules.map((rule, index) => (_jsxs("tr", { children: [_jsx("td", { children: rule.shipperId }), _jsx("td", { children: rule.truckType }), _jsxs("td", { children: [rule.minMileageKm, "-", rule.maxMileageKm] }), _jsx("td", { children: rule.unitPricePerKm }), _jsx("td", { children: rule.loadingFee }), _jsx("td", { children: rule.insuranceRate })] }, `${rule.shipperId}-${index}`))) })] })] }), _jsxs("section", { className: "card timeline-card", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u72B6\u6001\u6D41\u8F6C + MQ \u4E8B\u4EF6" }), _jsx("span", { children: "\u8FD0\u5355\u72B6\u6001\u4F7F\u7528 RabbitMQ \u6295\u9012\u4E8B\u4EF6\uFF0C\u652F\u6301\u5E42\u7B49\u6D88\u8D39\u4E0E\u6B7B\u4FE1\u9694\u79BB" })] }), _jsx("div", { className: "timeline", children: bootstrap.statusFlow.map((node) => (_jsxs("div", { className: "timeline-node", children: [_jsx("strong", { children: node.status }), _jsx("span", { children: node.next.join(' / ') || 'END' })] }, node.status))) })] })] })), active === 'architecture' && (_jsx("section", { className: "panel-stack", children: _jsxs("section", { className: "card architecture-board", children: [_jsxs("div", { className: "section-head", children: [_jsx("h3", { children: "\u7CFB\u7EDF\u67B6\u6784" }), _jsx("span", { children: "\u5355\u673A\u53EF\u8DD1\uFF0C\u5206\u5E03\u5F0F\u53EF\u6269" })] }), _jsxs("div", { className: "arch-grid", children: [_jsxs("article", { children: [_jsx("strong", { children: "Web / Nginx" }), _jsx("p", { children: "React + Vite \u7BA1\u7406\u540E\u53F0\uFF0C\u652F\u6301\u4E2D\u82F1\u6587\u548C Google \u767B\u5F55\u5165\u53E3\u3002" })] }), _jsxs("article", { children: [_jsx("strong", { children: "App Servers" }), _jsx("p", { children: "Node.js MVC API\uFF0C\u5E42\u7B49\u952E\u3001RBAC\u3001\u5206\u5E03\u5F0F\u9501\u3001\u8FD0\u8D39\u6838\u7B97\u3001\u62A5\u8868\u805A\u5408\u3002" })] }), _jsxs("article", { children: [_jsx("strong", { children: "RabbitMQ" }), _jsx("p", { children: "\u8FD0\u5355\u72B6\u6001\u6D88\u606F\u3001\u91CD\u8BD5\u961F\u5217\u3001\u6B7B\u4FE1\u961F\u5217\u3001\u6D88\u8D39\u5E42\u7B49\u8BB0\u5F55\u3002" })] }), _jsxs("article", { children: [_jsx("strong", { children: "MySQL Shards" }), _jsx("p", { children: "\u6309\u6708 + hash \u5206\u8868\uFF0C\u8DEF\u7531\u8868\u652F\u6301\u672A\u6765\u6269\u5BB9\u8FC1\u79FB\u3002" })] }), _jsxs("article", { children: [_jsx("strong", { children: "Redis" }), _jsx("p", { children: "\u57FA\u7840\u6863\u6848\u7F13\u5B58\u3001\u5206\u5E03\u5F0F\u9501\u3001\u5E42\u7B49\u8BF7\u6C42\u8BB0\u5F55\u3001\u7EDF\u8BA1\u7F13\u5B58\u3002" })] }), _jsxs("article", { children: [_jsx("strong", { children: "Observability" }), _jsx("p", { children: "\u8FD0\u884C\u65E5\u5FD7\u3001MQ \u6D88\u8D39\u65E5\u5FD7\u3001\u4E1A\u52A1\u5BA1\u8BA1\u65E5\u5FD7\uFF0C\u652F\u6491\u95EE\u9898\u590D\u76D8\u3002" })] })] })] }) }))] })] }));
}
