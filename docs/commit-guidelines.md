# 提交规范与每日提交要求

本项目按“过程管控”验收要求，采用小粒度、每日提交、备注清晰的策略。

## 1. 提交频率

- 每日最少 1 次提交
- 每个功能点拆为 1~3 个提交，不混合无关改动

## 2. 提交粒度

单次提交建议只做一类改动：

- `feat`：新功能（例如新增规则接口）
- `fix`：缺陷修复（例如幂等重复发布）
- `refactor`：重构（不改行为）
- `docs`：文档
- `test`：测试

## 3. 提交信息模板

```text
<type>(<scope>): <summary>

背景:
- <为什么改>

改动:
- <关键改动1>
- <关键改动2>

验证:
- <命令和结果>
```

示例：

```text
feat(api): add pricing rule management endpoints

背景:
- 支持结算规则配置化，快速微调

改动:
- 新增 GET/POST /api/pricing-rules
- 新增 POST /api/pricing-rules/reload
- 启动时从 pricing_rule 表加载规则

验证:
- npm run check --workspace @waybill/api 通过
- 手工调用接口返回 200/201
```

## 4. 每日提交清单（建议）

- 业务功能提交
- 文档同步提交
- 验证/测试提交

## 5. 备注清晰要求

提交说明必须包含：

- 改动目标（解决什么问题）
- 关键逻辑（做了什么）
- 验证结论（如何证明）
