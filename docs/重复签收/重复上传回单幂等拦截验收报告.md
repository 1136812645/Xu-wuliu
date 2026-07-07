# 重复签收/重复上传回单幂等拦截验收报告（2026-07-06）

## 验收项

1. 重复操作不会更新数据库、不产生脏数据；
2. 接口返回明确拦截提示，无500 / 数据库异常；
3. 数据库存在唯一约束兜底（运单 + 操作类型唯一索引）。

## 1. 运行态验证

预置样本运单：

- waybillId: `waybill-3`
- 初始状态: `ASSIGNED`

执行脚本：`powershell -ExecutionPolicy Bypass -File scripts/verify-idempotency-sign-pod.ps1`

结果：

```json
{
  "waybillId": "waybill-3",
  "sign": {
    "firstStatus": "SIGNED",
    "duplicateBlocked": true,
    "duplicateReason": "ALREADY_SIGNED",
    "duplicateMessage": "Duplicate SIGN operation was ignored because waybill is already signed.",
    "signedAtUnchanged": true,
    "sameKeyBlocked": true,
    "sameKeyReason": "IDEMPOTENCY_KEY_HIT"
  },
  "pod": {
    "firstStatus": "POD_UPLOADED",
    "duplicateBlocked": true,
    "duplicateReason": "ALREADY_POD_UPLOADED",
    "duplicateMessage": "Duplicate UPLOAD_POD operation was ignored because POD is already uploaded.",
    "podUploadedAtUnchanged": true,
    "sameKeyBlocked": true,
    "sameKeyReason": "IDEMPOTENCY_KEY_HIT"
  }
}
```

结论：重复签收与重复上传回单均未再次更新状态时间戳，未产生脏数据。

## 2. 错误路径验证（无500）

场景：缺失幂等键调用签收接口。

结果：

- HTTP 400（业务参数错误）
- 无 500，无数据库异常抛出

结论：接口错误路径可控，返回业务错误而非系统异常。

## 3. 数据库唯一约束兜底

建表脚本：`db/init/01_schema.sql`

关键约束：

- `UNIQUE KEY uk_waybill_operation (waybill_no, operation_type)`
- `UNIQUE KEY uk_waybill_idempotency_key (idempotency_key)`

结论：数据库层具备“运单 + 操作类型唯一”与“幂等键唯一”双重兜底。

## 最终结论

- 验收标准 1：通过
- 验收标准 2：通过
- 验收标准 3：通过
