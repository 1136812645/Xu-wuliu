# Duplicate Sign Replay 2026-07-08 Log Snippets

sourceLog: apps/api/apps/api/logs/api-2026-07-08.log

waybillNo: WB178271644
createKey: bugreplay3-create-3d761a45ea68477e90c98812b38e712e
signKey1: bugreplay3-sign1-a46ef17db7444404b0c683e98c2a0f70
signKey2: bugreplay3-sign2-0f6809b9b4094ffbb83da4d324ea2354

```text
1231:{"ts":"2026-07-08T13:37:07.233Z","level":"INFO","message":"waybill.created","context":{"idempotencyKey":"bugreplay3-create-3d761a45ea68477e90c98812b38e712e","waybillNo":"WB178271644","splitApplied":false}}
1232:{"ts":"2026-07-08T13:37:07.234Z","level":"INFO","message":"request.received","context":{"method":"POST","path":"/api/waybills/WB178271644/sign","instanceId":"api-local-1"}}
1233:{"ts":"2026-07-08T13:37:07.298Z","level":"INFO","message":"waybill.signed","context":{"idempotencyKey":"bugreplay3-sign1-a46ef17db7444404b0c683e98c2a0f70","waybillNo":"WB178271644"}}
1234:{"ts":"2026-07-08T13:37:07.299Z","level":"INFO","message":"request.received","context":{"method":"POST","path":"/api/waybills/WB178271644/sign","instanceId":"api-local-1"}}
```
