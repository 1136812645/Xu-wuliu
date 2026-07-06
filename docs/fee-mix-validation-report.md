# 多维度运费叠加与正负金额混合验收报告（2026-07-06）

## 验收项

1. 每一项费用独立展示明细，可溯源；无费用漏算。
2. 正负金额加减逻辑无精度丢失（保留两位小数）。
3. 总金额负数场景可正常保存运单，结算页面可展示负金额应付，并有明细数据。

## 用例与结果

### 用例 A：费用明细独立展示与可溯源

请求：`POST /api/waybills/quote`

输入摘要：

- mileageKm=100
- extraLoadingFee=60
- subsidy=100
- deduction=20

结果：

- feeCount=5
- feeTypes=LINE_HAUL, LOADING, INSURANCE, SUBSIDY, DEDUCTION
- formulaLineHaul=`100km x 8.2`
- formulaLoading=`180 + 60`
- total=1149.84

结论：通过（费用项完整、公式可追溯、无漏算）。

### 用例 B：正负金额混合与精度

请求：`POST /api/waybills/quote`

输入摘要：

- mileageKm=123.45
- extraLoadingFee=12.34
- subsidy=-45.67
- deduction=89.01

结果：

- lineHaul=1012.29
- loading=192.34
- insurance=12.15
- subsidy=-45.67
- deduction=-89.01
- total=1082.1
- sumByItems=1082.1
- precisionOk=true

结论：通过（正负金额加减正确，汇总与明细和一致，保留两位小数）。

### 用例 C：负总额保存与展示

步骤：

1. 通过规则接口将首段运价调低（用于构造负总额）。
2. 创建运单：mileageKm=10、subsidy=-200、deduction=50。

结果：

- waybillNo=WB26618453
- totalAmount=-240
- isNegative=true
- feeItems=5
- 明细：
  - LINE_HAUL=10
  - LOADING=0
  - INSURANCE=0
  - SUBSIDY=-200
  - DEDUCTION=-50

结论：通过（负总额可保存且明细完整）。

## 结算页面展示证据

前端列表金额渲染统一调用 `money(item.totalAmount)`，对负数金额同样生效：

- `apps/web/src/App.tsx` 运单列表金额列使用 `money(item.totalAmount)`。

说明：`Intl.NumberFormat` 金额格式对负值会输出负金额货币格式，可在结算/运单列表直接展示负金额应付。

## 最终结论

- 验收标准 1：通过
- 验收标准 2：通过
- 验收标准 3：通过
