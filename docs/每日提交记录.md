# 每日提交记录

> 说明：本文件用于过程管控验收，记录每天提交主题、粒度、验证结果。

## 2026-07-06

1. feat(api): add pricing rule management endpoints
- 改动：新增 `GET /api/pricing-rules`、`POST /api/pricing-rules`、`POST /api/pricing-rules/reload`
- 目的：支持结算规则配置化与快速微调
- 验证：接口手工调用返回 200/201

2. feat(api): add structured log retention
- 改动：新增 `apps/api/src/logger.ts`，接入请求与核心业务日志落盘
- 目的：支持 bug 排查日志留存
- 验证：生成 `apps/api/logs/api-YYYY-MM-DD.log`

3. docs(process): add commit and troubleshooting process docs
- 改动：新增提交规范与每日提交记录模板，更新故障排查文档
- 目的：补齐过程管控交付物
- 验证：文档可用于验收答辩
