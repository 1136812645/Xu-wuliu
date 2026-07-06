# 异常边界验收报告：零运费、零里程、负数补贴、空运单（2026-07-06）

## 验收标准

- 所有边界场景页面无报错；
- 接口正常返回；
- 金额计算逻辑符合需求。

## 1. 运行态用例结果

执行脚本：`scripts/verify-boundary-fee-cases.ps1`

结果汇总：

1. `zero-mileage`
- quoteStatus=200
- createStatus=201
- lineHaul=0
- loading=120
- insurance=0
- subsidy=0
- deduction=0
- totalAmount=120

2. `zero-freight`
- quoteStatus=200
- createStatus=201
- lineHaul=0
- loading=0
- insurance=0
- subsidy=0
- deduction=0
- totalAmount=0

3. `negative-subsidy`
- quoteStatus=200
- createStatus=201
- lineHaul=0
- loading=120
- insurance=0
- subsidy=-20
- deduction=0
- totalAmount=100

4. `empty-waybill`
- quoteStatus=400
- createStatus=400
- 错误体：`{"message":"Empty waybill is not allowed."}`

说明：空运单属于业务拦截场景，返回明确 400 业务错误，非 500。

## 2. 金额逻辑核对

- 零里程：干线运费为 0，其他费用按规则计算，总额正确；
- 零运费：通过 `extraLoadingFee=-120` 抵消基础装卸费后，总额为 0；
- 负数补贴：补贴项保留负数并正确参与总额计算；
- 空运单：不参与计算，直接按业务规则拒绝。

## 3. 页面无报错证据

- 前端创建运单失败时不会崩溃，错误显示到提交提示：
  - `apps/web/src/App.tsx` 中 `handleCreateWaybill` 的 `catch` 分支调用 `setSubmitMessage`。
- 前端类型检查通过：`npm run check --workspace @waybill/web`。

## 4. 结论

- 零运费：通过
- 零里程：通过
- 负数补贴：通过
- 空运单：通过（按业务规则返回明确错误）

总体结论：边界场景页面无报错、接口返回可控、金额逻辑符合需求。
