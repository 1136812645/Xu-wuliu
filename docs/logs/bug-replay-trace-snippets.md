# Bug Replay Trace Snippets

## First Replay (before fix)
```text
2026-07-06T21:35:08.3869854+08:00 STEP1 health check
2026-07-06T21:35:08.3899942+08:00 health={"status":"ok","service":"waybill-api","instanceId":"api-38640"}
2026-07-06T21:35:08.3909944+08:00 STEP2 create replay vehicle vehicle-3
2026-07-06T21:35:08.3968840+08:00 vehicle.id=vehicle-mr99ihyg133 plate=?A77777
2026-07-06T21:35:08.3978923+08:00 STEP3 create one waybill
2026-07-06T21:35:08.7419751+08:00 create.id=waybill-3 waybillNo=WB44908401 status=ASSIGNED
2026-07-06T21:35:08.7429752+08:00 STEP4 sign waybill first time
2026-07-06T21:35:08.7554930+08:00 sign1.status=SIGNED podUploaded=False
2026-07-06T21:35:08.7564928+08:00 STEP5 duplicate sign with another idempotency key
2026-07-06T21:35:08.7624949+08:00 sign2.idempotentBlocked=True reason=ALREADY_SIGNED
2026-07-06T21:35:08.7634934+08:00 STEP6 inject invalid mq payload
2026-07-06T21:35:08.9585069+08:00 STEP7 read mq runtime status
2026-07-06T21:35:08.9615005+08:00 mq={"connected":true,"consumerStarted":true,"exchanges":{"eventExchange":"waybill.events.x","retryExchange":"waybill.events.retry.x","deadLetterExchange":"waybill.events.dlx"},"queues":{"eventQueue":"waybill.events.q","retryQueue":"waybill.events.retry.q","deadLetterQueue":"waybill.events.dlq"},"stats":{"published":2,"publishFailed":0,"consumed":1,"duplicated":0,"deadLettered":0},"outbox":{"size":0,"items":[]},"processedEventCount":1}
2026-07-06T21:35:08.9635012+08:00 DONE
```

## Second Replay (after fix)
```text
2026-07-06T21:37:07.0569560+08:00 STEP1 create vehicle, expect id generated
2026-07-06T21:37:07.0908138+08:00 vehicle.id=vehicle-mr99l1jc160
2026-07-06T21:37:07.0918132+08:00 STEP2 create waybill
2026-07-06T21:37:07.1087257+08:00 create.id=waybill-3 waybillNo=WB45027100
2026-07-06T21:37:07.1097273+08:00 STEP3 sign first time
2026-07-06T21:37:07.1177269+08:00 sign1.status=SIGNED
2026-07-06T21:37:07.1187253+08:00 STEP4 duplicate sign second time
2026-07-06T21:37:07.1217260+08:00 sign2.idempotentBlocked=True reason=ALREADY_SIGNED
```
