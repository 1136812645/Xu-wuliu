# 车辆载重 + 体积双约束与超量拆分验收报告（2026-07-06）

## 验收项

1. 重量、体积双条件同时校验，任一超标均拦截；
2. 提示清晰，告知超限数值；
3. 系统不会保存超限运单。

## 验证方法

- 报价接口验证拦截：POST /api/waybills/quote
- 创建接口验证自动拆分提示：POST /api/waybills
- 脚本：scripts/verify-capacity-split.ps1

## 结果明细

### 用例1：仅超重

- 输入超重：2500kg
- 输入超体积：-1m3（未超）
- 报价接口：400（被拦截）
- 创建接口：201，splitApplied=true，splitCount=2
- 提示值：overweightKg=2500，overVolumeM3=0
- 子运单校验：childrenWithinLimit=true

### 用例2：仅超体积

- 输入超重：-100kg（未超）
- 输入超体积：12m3
- 报价接口：400（被拦截）
- 创建接口：201，splitApplied=true，splitCount=2
- 提示值：overweightKg=0，overVolumeM3=12
- 子运单校验：childrenWithinLimit=true

### 用例3：重量 + 体积同时超限

- 输入超重：3000kg
- 输入超体积：15m3
- 报价接口：400（被拦截）
- 创建接口：201，splitApplied=true，splitCount=2
- 提示值：overweightKg=3000，overVolumeM3=15
- 子运单校验：childrenWithinLimit=true

## 错误提示可读性验证

Node fetch 直接读取报价接口错误体：

- status=400
- body={"message":"Capacity exceeded. overweightKg=2500, overVolumeM3=0, suggestedSplitCount=2"}

说明：错误提示包含超限数值与建议拆分数，提示清晰可解释。

## 结论

- 验收标准1：通过（报价接口对任一超限进行拦截；创建接口对超限原单触发拆分处理）
- 验收标准2：通过（提示包含 overweightKg / overVolumeM3 / suggestedSplitCount）
- 验收标准3：通过（超限原单不直接保存，保存的是满足约束的拆分子运单）
