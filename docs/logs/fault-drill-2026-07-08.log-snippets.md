# Fault Drill 2026-07-08 Log Snippets

sourceLog: apps/api/apps/api/logs/api-2026-07-08.log

Replay waybillNo: WB173443517
Illegal outbox eventId: manual-illegal-1783517348033

```text
1207:{"ts":"2026-07-08T13:29:04.403Z","level":"INFO","message":"waybill.created","context":{"idempotencyKey":"fault-drill-create-1783517344312","waybillNo":"WB173443517","splitApplied":false}}
1208:{"ts":"2026-07-08T13:29:04.405Z","level":"INFO","message":"request.received","context":{"method":"POST","path":"/api/waybills/WB173443517/sign","instanceId":"api-local-1"}}
1209:{"ts":"2026-07-08T13:29:04.459Z","level":"INFO","message":"waybill.signed","context":{"idempotencyKey":"fault-drill-sign-1783517344404","waybillNo":"WB173443517"}}
1210:{"ts":"2026-07-08T13:29:04.484Z","level":"INFO","message":"request.received","context":{"method":"GET","path":"/api/faults/diagnostics","instanceId":"api-local-1"}}
1211:{"ts":"2026-07-08T13:29:06.172Z","level":"INFO","message":"request.received","context":{"method":"GET","path":"/api/faults/diagnostics","instanceId":"api-local-1"}}
1212:{"ts":"2026-07-08T13:29:07.881Z","level":"INFO","message":"request.received","context":{"method":"POST","path":"/api/waybills/WB173443517/upload-pod","instanceId":"api-local-1"}}
1213:{"ts":"2026-07-08T13:29:07.946Z","level":"INFO","message":"waybill.pod_uploaded","context":{"idempotencyKey":"fault-drill-pod-1783517347880","waybillNo":"WB173443517"}}
1215:{"ts":"2026-07-08T13:29:08.031Z","level":"INFO","message":"waybill.created","context":{"idempotencyKey":"fault-drill-mq-create-1783517347947","waybillNo":"WB173479851","splitApplied":false}}
1217:{"ts":"2026-07-08T13:29:08.045Z","level":"INFO","message":"request.received","context":{"method":"GET","path":"/api/faults/diagnostics","instanceId":"api-local-1"}}
1218:{"ts":"2026-07-08T13:29:09.864Z","level":"INFO","message":"request.received","context":{"method":"GET","path":"/api/faults/diagnostics","instanceId":"api-local-1"}}
1219:{"ts":"2026-07-08T13:29:11.549Z","level":"INFO","message":"request.received","context":{"method":"POST","path":"/api/mq/outbox/flush","instanceId":"api-local-1"}}
```
