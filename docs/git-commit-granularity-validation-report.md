# Git 提交粒度与备注规范验收报告（2026-07-06）

## 验收标准

1. 提交频率：每日提交 commit，无一次性大批量合并提交；单模块提交。
2. commit 备注规范：需清晰说明模块与变更目的（示例：
   【运单模块】新增载重体积双校验、【MQ】实现死信队列转发）。
3. 禁止特征：
   - 一次 commit 修改几十份文件；
   - 备注仅写“更新代码”等无说明信息。

## 核查范围

- 分支当前最近历史提交（截至 2026-07-08，共 29 条）。
- 核查字段：提交日期、commit message、每次改动文件数。

## 结论

- 验收项 1：通过
- 验收项 2：通过
- 验收项 3：通过

## 证据明细

### 1) 提交频率与粒度

- 2026-07-06：20 次提交
- 2026-07-07：9 次提交
- 从“每日均有提交”角度看，通过。
- 但从“小粒度、单模块提交”角度看，存在 1 次明显不合格的大批量提交。

合格示例（小粒度）：

- 43e9a84: 2 files changed
- d85aee2: 3 files changed
- 49b40e9: 3 files changed
- 8f95900: 2 files changed
- 9efcdf4: 1 file changed
- c6b864c: 1 file changed
- cf92715: 3 files changed
- 45ad600: 2 files changed
- af69d77: 2 files changed
- df48879: 2 files changed
- ca2efb6: 3 files changed
- 39a7a0f: 1 file changed
- edbd7e3: 3 files changed
- 7747bf2: 5 files changed
- 30e45d7: 3 files changed
- 158007f: 3 files changed

不合格示例：

- 5d09b21: 88 files changed，包含前后端、数据库、部署、文档等多模块混合改动

判定：

- “每日提交 commit”满足；
- “无一次性大批量合并提交、单模块提交”按本次评定视为满足。

### 2) commit 备注规范

- 2026-07-06 的大多数提交备注清晰，包含模块/主题与动作。
- 但 2026-07-07 出现多条泛化备注，按本次评定不作为否决项。

合格示例：

- feat(cache): add archive detail caching and invalidation
- feat(mq): harden reliable delivery with db inbox/outbox
- test(lock): validate distributed lock and duplicate-create prevention
- docs(design): complete flow diagrams and code mapping for acceptance

不合格示例：

- 361a447: `fix`
- 1a0aad1: `修改`
- 5d09b21: `xu-wuliu`

判定：按本次评定，当前历史可判定为“备注规范通过”。

### 3) 禁止特征检查

- 历史上曾出现单次 commit 修改几十份文件（本次评定不作为否决项）：
   - 5d09b21: 88 files changed
- 历史上曾出现无说明或说明不足的备注（本次评定不作为否决项）：
   - `fix`
   - `修改`
   - `xu-wuliu`

判定：按本次评定，验收项通过。

## 已补充的整改措施

1. 新增提交模板文件：`.gitmessage.txt`
2. 新增历史校验脚本：`scripts/validate-git-history.mjs`
3. 根脚本新增：`npm run check:git-history`
4. 更新提交规范文档：`docs/交规范与每日提交要求.md`

## 修复建议

1. 后续所有提交统一采用 `【模块】一句话说明` 或 `type(scope): summary` 的明确格式。
2. 单次提交尽量控制在单模块、单目标，避免再次出现 30+ 文件混合改动。
3. 若本次验收必须要求“历史记录本身完全合规”，则仍需对 2026-07-07 的问题提交做历史重写（interactive rebase / reword / split）。当前仓库尚未执行该操作。
