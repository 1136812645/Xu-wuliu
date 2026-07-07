import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { createWaybill, fetchBootstrap, fetchDashboard, fetchWarnings, fetchWaybills } from './api';
import type { BootstrapPayload, DashboardPayload, DocumentWarning, WaybillRecord } from './types';

type NavKey = 'overview' | 'waybills' | 'warnings' | 'settlement' | 'architecture';
type WarningFilter = 'ALL' | 'EXPIRED';

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

function money(value: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
  }).format(value);
}

export function App() {
  const [active, setActive] = useState<NavKey>('overview');
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [waybills, setWaybills] = useState<WaybillRecord[]>([]);
  const [warnings, setWarnings] = useState<DocumentWarning[]>([]);
  const [warningFilter, setWarningFilter] = useState<WarningFilter>('ALL');
  const [draft, setDraft] = useState(defaultDraft);
  const [submitMessage, setSubmitMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
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
  }, []);

  async function handleCreateWaybill(event: React.FormEvent<HTMLFormElement>) {
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
    } catch (error) {
      setSubmitMessage(error instanceof Error ? error.message : '创建失败');
    }
  }

  if (loading || !bootstrap || !dashboard) {
    return <div className="loading-shell">Loading internal admin console...</div>;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Internal Logistics Suite</p>
          <h1>运单 & 结算管理后台</h1>
          <p className="sidebar-copy">面向货主、承运商、管理员的多语言内部控制台，覆盖运单、结算、档案预警与分布式架构治理。</p>
        </div>

        <nav className="nav-list">
          {[
            ['overview', '总览 Dashboard'],
            ['waybills', '运单中心 Waybills'],
            ['warnings', '证件预警 Alerts'],
            ['settlement', '结算规则 Settlement'],
            ['architecture', '架构方案 Architecture'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={active === key ? 'nav-item active' : 'nav-item'}
              onClick={() => setActive(key as NavKey)}
            >
              {label}
            </button>
          ))}
        </nav>

        <section className="login-card">
          <span className="chip">Google SSO</span>
          <p>支持 Google OAuth2 登录与 RBAC 权限控制。</p>
          <div className="role-grid">
            {Object.entries(bootstrap.permissions).map(([role, permissions]) => (
              <div key={role} className="role-card">
                <strong>{role}</strong>
                <span>{permissions.length} permissions</span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className="content">
        <header className="hero">
          <div>
            <p className="eyebrow">Bilingual Admin Experience</p>
            <h2>{bootstrap.system.name}</h2>
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
                <span>运单量</span>
                <strong>{dashboard.metrics.waybillCount}</strong>
                <p>支持高并发开单与分表扩展</p>
              </article>
              <article className="metric-card accent-blue">
                <span>营收 Revenue</span>
                <strong>{money(dashboard.metrics.revenue)}</strong>
                <p>费用明细可追溯，支持负金额</p>
              </article>
              <article className="metric-card accent-green">
                <span>承运商毛利</span>
                <strong>{money(dashboard.metrics.carrierGrossProfit)}</strong>
                <p>报表页缓存热点统计结果</p>
              </article>
              <article className="metric-card accent-red">
                <span>签收率</span>
                <strong>{Math.round(dashboard.metrics.onTimeSignRate * 100)}%</strong>
                <p>幂等签收与回单上传保护</p>
              </article>
            </div>

            <div className="two-column">
              <section className="card">
                <div className="section-head">
                  <h3>最近运单</h3>
                  <span>Recent waybills</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>运单号</th>
                      <th>货物</th>
                      <th>状态</th>
                      <th>金额</th>
                      <th>分表</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.waybills.map((item) => (
                      <tr key={item.id}>
                        <td>{item.waybillNo}</td>
                        <td>{item.goodsName}</td>
                        <td>{item.status}</td>
                        <td>{money(item.totalAmount)}</td>
                        <td>{item.shardTable}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="card">
                <div className="section-head">
                  <h3>证件预警</h3>
                  <span>Driver & vehicle alerts</span>
                </div>
                <div className="warning-list">
                  {dashboard.warnings.map((warning) => (
                    <article key={warning.entityId + warning.documentName} className={`warning-item ${warning.status.toLowerCase()}`}>
                      <strong>{warning.entityName}</strong>
                      <span>{warning.documentName}</span>
                      <p>{warning.expiryDate} / {warning.status}</p>
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
                  <h3>新建运单</h3>
                  <span>Capacity guard + fee details</span>
                </div>
                <form className="form-grid" onSubmit={handleCreateWaybill}>
                  {[
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
                  ].map(([label, field]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        value={String(draft[field as keyof typeof draft])}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            [field]: event.target.value,
                          }))
                        }
                      />
                    </label>
                  ))}
                  <button className="primary-button" type="submit">创建运单</button>
                  {submitMessage ? <p className="submit-message">{submitMessage}</p> : null}
                </form>
              </section>

              <section className="card">
                <div className="section-head">
                  <h3>运单列表</h3>
                  <span>Idempotent operations and shard routing</span>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>运单号</th>
                      <th>状态</th>
                      <th>货物</th>
                      <th>里程</th>
                      <th>总费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    {waybills.map((item) => (
                      <tr key={item.id}>
                        <td>{item.waybillNo}</td>
                        <td>{item.status}</td>
                        <td>{item.goodsName}</td>
                        <td>{item.mileageKm}</td>
                        <td>{money(item.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </section>
        )}

        {active === 'warnings' && (
          <section className="card">
            <div className="section-head">
              <h3>档案与证件预警</h3>
              <span>红色标记过期/临期数据，非法日期不阻塞页面</span>
            </div>
            <div className="filter-row">
              <button
                type="button"
                className={warningFilter === 'ALL' ? 'filter-button active' : 'filter-button'}
                onClick={() => setWarningFilter('ALL')}
              >
                全部
              </button>
              <button
                type="button"
                className={warningFilter === 'EXPIRED' ? 'filter-button active' : 'filter-button'}
                onClick={() => setWarningFilter('EXPIRED')}
              >
                仅证件过期
              </button>
            </div>
            <div className="warning-list">
              {warnings
                .filter((item) => (warningFilter === 'EXPIRED' ? item.status === 'EXPIRED' : true))
                .map((warning) => (
                  <article
                    key={`${warning.entityId}-${warning.documentName}`}
                    className={`warning-item ${warning.status.toLowerCase()}`}
                  >
                    <strong>{warning.entityName}</strong>
                    <span>{warning.documentName}</span>
                    <p>
                      {warning.expiryDate} / {warning.status}
                      {warning.daysRemaining !== null ? ` / 剩余${warning.daysRemaining}天` : ' / 非法日期'}
                    </p>
                  </article>
                ))}
            </div>
            <div className="reference-grid">
              {bootstrap.references.vehicles.map((vehicle) => (
                <article key={vehicle.id} className="reference-card">
                  <strong>{vehicle.plateNumber}</strong>
                  <span>{vehicle.truckType}</span>
                  <p>载重 {vehicle.maxWeightKg}kg / 体积 {vehicle.maxVolumeM3}m3</p>
                  <p>道路许可证: {vehicle.roadPermitExpiry}</p>
                </article>
              ))}
              {bootstrap.references.drivers.map((driver) => (
                <article key={driver.id} className="reference-card">
                  <strong>{driver.name}</strong>
                  <span>{driver.licenseNumber}</span>
                  <p>{driver.phone}</p>
                  <p>驾驶证到期: {driver.licenseExpiry}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        {active === 'settlement' && (
          <section className="panel-stack">
            <section className="card">
              <div className="section-head">
                <h3>结算规则配置化</h3>
                <span>Change config, not core flow</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>货主</th>
                    <th>车型</th>
                    <th>里程区间</th>
                    <th>单价</th>
                    <th>装卸费</th>
                    <th>保费率</th>
                  </tr>
                </thead>
                <tbody>
                  {bootstrap.references.pricingRules.map((rule, index) => (
                    <tr key={`${rule.shipperId}-${index}`}>
                      <td>{rule.shipperId}</td>
                      <td>{rule.truckType}</td>
                      <td>{rule.minMileageKm}-{rule.maxMileageKm}</td>
                      <td>{rule.unitPricePerKm}</td>
                      <td>{rule.loadingFee}</td>
                      <td>{rule.insuranceRate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card timeline-card">
              <div className="section-head">
                <h3>状态流转 + MQ 事件</h3>
                <span>运单状态使用 RabbitMQ 投递事件，支持幂等消费与死信隔离</span>
              </div>
              <div className="timeline">
                {bootstrap.statusFlow.map((node) => (
                  <div key={node.status} className="timeline-node">
                    <strong>{node.status}</strong>
                    <span>{node.next.join(' / ') || 'END'}</span>
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
                <h3>系统架构</h3>
                <span>单机可跑，分布式可扩</span>
              </div>
              <div className="arch-grid">
                <article>
                  <strong>Web / Nginx</strong>
                  <p>React + Vite 管理后台，支持中英文和 Google 登录入口。</p>
                </article>
                <article>
                  <strong>App Servers</strong>
                  <p>Node.js MVC API，幂等键、RBAC、分布式锁、运费核算、报表聚合。</p>
                </article>
                <article>
                  <strong>RabbitMQ</strong>
                  <p>运单状态消息、重试队列、死信队列、消费幂等记录。</p>
                </article>
                <article>
                  <strong>MySQL Shards</strong>
                  <p>按月 + hash 分表，路由表支持未来扩容迁移。</p>
                </article>
                <article>
                  <strong>Redis</strong>
                  <p>基础档案缓存、分布式锁、幂等请求记录、统计缓存。</p>
                </article>
                <article>
                  <strong>Observability</strong>
                  <p>运行日志、MQ 消费日志、业务审计日志，支撑问题复盘。</p>
                </article>
              </div>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
